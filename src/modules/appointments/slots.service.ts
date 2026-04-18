import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessHours,
  DayOfWeek,
} from '../business-hours/entities/business-hours.entity';
import { BlockedSlot } from '../blocked-slots/entities/blocked-slot.entity';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
import { Service } from '../services/entities/service.entity';

export interface TimeSlot {
  time: string; // HH:mm
  available: boolean;
  reason?: string; // If not available, reason
}

@Injectable()
export class SlotsService {
  private readonly logger = new Logger(SlotsService.name);
  private static readonly DEFAULT_PENDING_TTL_MINUTES = 15;

  constructor(
    @InjectRepository(BusinessHours)
    private businessHoursRepository: Repository<BusinessHours>,
    @InjectRepository(BlockedSlot)
    private blockedSlotsRepository: Repository<BlockedSlot>,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
    private configService: ConfigService,
  ) {}

  /**
   * Get available slots for a service and date.
   */
  async getAvailableSlots(
    serviceId: string,
    date: string,
  ): Promise<TimeSlot[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Formato de fecha invalido. Use YYYY-MM-DD');
    }

    const service = await this.servicesRepository.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new BadRequestException('Servicio no encontrado');
    }

    const dayOfWeek = this.getDayOfWeekFromString(date);
    this.logger.debug(`Fecha: ${date} -> Dia: ${dayOfWeek}`);

    const businessHours = await this.businessHoursRepository.findOne({
      where: {
        dayOfWeek,
        isActive: true,
      },
    });

    if (!businessHours) {
      this.logger.warn(`No hay horarios configurados para ${dayOfWeek}`);
      return [];
    }

    const allSlots = this.generateTimeSlots(
      businessHours.openTime,
      businessHours.closeTime,
      businessHours.slotDurationMinutes,
      service.durationMinutes,
    );

    const blockedSlots = await this.getBlockedSlotsForDate(date);

    const pendingTtlMinutes = this.getPendingTtlMinutes();
    const existingAppointments = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .select(['appointment.appointmentTime'])
      .where('appointment.appointmentDate = :date', { date })
      .andWhere('appointment.status != :cancelledStatus', {
        cancelledStatus: AppointmentStatus.CANCELLED,
      })
      .andWhere(
        "(appointment.status != :pendingStatus OR appointment.createdAt > (NOW() - (:pendingTtlMinutes * INTERVAL '1 minute')))",
        {
          pendingStatus: AppointmentStatus.PENDING,
          pendingTtlMinutes,
        },
      )
      .getMany();
    const occupiedSlots = new Set(
      existingAppointments
        .map((appointment) => this.normalizeTime(appointment.appointmentTime))
        .filter(Boolean),
    );

    const slotsWithAvailability = allSlots.map((slot) => {
      const isBlocked = this.isSlotBlocked(slot, blockedSlots);
      if (isBlocked) {
        return {
          time: slot,
          available: false,
          reason: 'Horario bloqueado',
        };
      }

      const isOccupied = occupiedSlots.has(this.normalizeTime(slot));
      if (isOccupied) {
        return {
          time: slot,
          available: false,
          reason: 'Horario ocupado',
        };
      }

      return {
        time: slot,
        available: true,
      };
    });

    return slotsWithAvailability;
  }

  /**
   * Generate slots between open and close time.
   */
  private generateTimeSlots(
    startTime: string,
    endTime: string,
    intervalMinutes: number,
    serviceDuration: number,
  ): string[] {
    const slots: string[] = [];

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    while (currentMinutes + serviceDuration <= endMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const minutes = currentMinutes % 60;

      const timeSlot = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      slots.push(timeSlot);

      currentMinutes += intervalMinutes;
    }

    return slots;
  }

  /**
   * Get day of week without UTC conversion.
   */
  private getDayOfWeekFromString(dateString: string): DayOfWeek {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const days = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];

    return days[date.getDay()];
  }

  private async getBlockedSlotsForDate(date: string): Promise<BlockedSlot[]> {
    return await this.blockedSlotsRepository.find({
      where: {
        blockedDate: date as any,
        isActive: true,
      },
    });
  }

  private isSlotBlocked(timeSlot: string, blockedSlots: BlockedSlot[]): boolean {
    const slotMinutes = this.timeToMinutes(timeSlot);

    if (slotMinutes === null) {
      return false;
    }

    for (const blocked of blockedSlots) {
      if (!blocked.startTime || !blocked.endTime) {
        return true;
      }

      const blockedStartMinutes = this.timeToMinutes(blocked.startTime);
      const blockedEndMinutes = this.timeToMinutes(blocked.endTime);

      if (blockedStartMinutes === null || blockedEndMinutes === null) {
        continue;
      }

      if (slotMinutes >= blockedStartMinutes && slotMinutes < blockedEndMinutes) {
        return true;
      }
    }

    return false;
  }

  private normalizeTime(time?: string): string {
    if (!time) {
      return '';
    }

    const [hours = '', minutes = ''] = time.trim().split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  private timeToMinutes(time?: string): number | null {
    if (!time) {
      return null;
    }

    const [hoursRaw, minutesRaw] = time.trim().split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return hours * 60 + minutes;
  }

  private getPendingTtlMinutes(): number {
    const raw =
      this.configService.get<string>('PENDING_APPOINTMENT_TTL_MINUTES') ??
      SlotsService.DEFAULT_PENDING_TTL_MINUTES.toString();
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return SlotsService.DEFAULT_PENDING_TTL_MINUTES;
    }

    return Math.floor(parsed);
  }
}
