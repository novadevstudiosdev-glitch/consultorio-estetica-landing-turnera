import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
  reason?: string; // Si no está disponible, por qué
}

@Injectable()
export class SlotsService {
  private readonly logger = new Logger(SlotsService.name);

  constructor(
    @InjectRepository(BusinessHours)
    private businessHoursRepository: Repository<BusinessHours>,
    @InjectRepository(BlockedSlot)
    private blockedSlotsRepository: Repository<BlockedSlot>,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
  ) {}

  /**
   * Obtener slots disponibles para un servicio en una fecha
   */
  async getAvailableSlots(
    serviceId: string,
    date: string,
  ): Promise<TimeSlot[]> {
    // 1. Validar fecha
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException('Fecha inválida');
    }

    // 2. Obtener el servicio
    const service = await this.servicesRepository.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new BadRequestException('Servicio no encontrado');
    }

    // 3. Obtener día de la semana
    const dayOfWeek = this.getDayOfWeek(dateObj);

    // 4. Obtener horarios de negocio
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

    // 5. Generar todos los slots posibles
    const allSlots = this.generateTimeSlots(
      businessHours.openTime,
      businessHours.closeTime,
      businessHours.slotDurationMinutes,
      service.durationMinutes,
    );

    // 6. Obtener slots bloqueados
    const blockedSlots = await this.getBlockedSlotsForDate(date);

    // 7. Obtener appointments existentes
    const existingAppointments = await this.appointmentsRepository.find({
      where: {
        appointmentDate: date as any,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    // 8. Marcar disponibilidad de cada slot
    const slotsWithAvailability = allSlots.map((slot) => {
      // Verificar si está bloqueado
      const isBlocked = this.isSlotBlocked(slot, blockedSlots);
      if (isBlocked) {
        return {
          time: slot,
          available: false,
          reason: 'Horario bloqueado',
        };
      }

      // Verificar si ya tiene appointment
      const isOccupied = existingAppointments.some(
        (apt) => apt.appointmentTime === slot,
      );
      if (isOccupied) {
        return {
          time: slot,
          available: false,
          reason: 'Horario ocupado',
        };
      }

      // Disponible!
      return {
        time: slot,
        available: true,
      };
    });

    return slotsWithAvailability;
  }

  /**
   * Generar slots de tiempo entre hora inicio y fin
   */
  private generateTimeSlots(
    startTime: string,
    endTime: string,
    intervalMinutes: number,
    serviceDuration: number,
  ): string[] {
    const slots: string[] = [];

    let [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Generar slots hasta que no quede tiempo para el servicio
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
   * Obtener día de la semana en formato DayOfWeek
   */
  private getDayOfWeek(date: Date): DayOfWeek {
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

  /**
   * Obtener slots bloqueados para una fecha
   */
  private async getBlockedSlotsForDate(date: string): Promise<BlockedSlot[]> {
    return await this.blockedSlotsRepository.find({
      where: {
        blockedDate: date as any,
        isActive: true,
      },
    });
  }

  /**
   * Verificar si un slot está bloqueado
   */
  private isSlotBlocked(
    timeSlot: string,
    blockedSlots: BlockedSlot[],
  ): boolean {
    for (const blocked of blockedSlots) {
      // Si no tiene horas específicas, bloquea TODO el día
      if (!blocked.startTime || !blocked.endTime) {
        return true;
      }

      // Verificar si el slot está dentro del rango bloqueado
      if (timeSlot >= blocked.startTime && timeSlot < blocked.endTime) {
        return true;
      }
    }

    return false;
  }
}
