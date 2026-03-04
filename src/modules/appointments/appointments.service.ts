import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
} from './entities/appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  UpdateAppointmentDto,
  AdminCreateAppointmentDto,
} from './dto/update-appointment.dto';
import { ServicesService } from '../services/services.service';
import {
  BusinessHours,
  DayOfWeek,
} from '../business-hours/entities/business-hours.entity';
import { BlockedSlot } from '../blocked-slots/entities/blocked-slot.entity';
import { EmailService } from '../../common/services/email.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(BusinessHours)
    private businessHoursRepository: Repository<BusinessHours>,
    @InjectRepository(BlockedSlot)
    private blockedSlotsRepository: Repository<BlockedSlot>,
    private servicesService: ServicesService,
    private emailService: EmailService,
  ) {}

  /**
   * Crear un turno (público - con validación de disponibilidad)
   */
  async create(
    createAppointmentDto: CreateAppointmentDto,
    userId?: string,
  ): Promise<Appointment> {
    // Verificar que el servicio existe
    const service = await this.servicesService.findOne(
      createAppointmentDto.serviceId,
    );

    if (!service.isActive) {
      throw new BadRequestException(
        'El servicio seleccionado no está disponible',
      );
    }

    // Verificar que el slot esté disponible
    await this.validateSlotAvailability(
      createAppointmentDto.appointmentDate,
      createAppointmentDto.appointmentTime,
    );

    // Validar horarios de negocio
    await this.validateBusinessHours(
      createAppointmentDto.appointmentDate,
      createAppointmentDto.appointmentTime,
    );

    // Validar slots bloqueados
    await this.validateNotBlocked(
      createAppointmentDto.appointmentDate,
      createAppointmentDto.appointmentTime,
    );

    // Crear turno
    const appointment = this.appointmentsRepository.create({
      ...createAppointmentDto,
      userId,
      status: AppointmentStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      createdByAdmin: false,
    });

    const saved = await this.appointmentsRepository.save(appointment);

    this.logger.log(
      `Turno creado: ${saved.patientName} - ${saved.appointmentDate} ${saved.appointmentTime}`,
    );

    // Enviar email de confirmación
    try {
      await this.emailService.sendAppointmentConfirmation(saved.patientEmail, {
        patientName: saved.patientName,
        serviceName: service.name,
        date: saved.appointmentDate.toString(),
        time: saved.appointmentTime,
        depositAmount: service.depositAmount,
      });

      saved.confirmationSent = true;
      await this.appointmentsRepository.save(saved);
    } catch (error) {
      this.logger.error('Error enviando email de confirmación:', error);
      // No fallar si el email no se envía
    }

    return saved;
  }

  /**
   * Crear turno como admin (sin validaciones estrictas)
   */
  async createAsAdmin(
    adminCreateDto: AdminCreateAppointmentDto,
    adminId: string,
  ): Promise<Appointment> {
    // Verificar que el servicio existe
    const service = await this.servicesService.findOne(
      adminCreateDto.serviceId,
    );

    // Verificar disponibilidad básica
    await this.validateSlotAvailability(
      adminCreateDto.appointmentDate,
      adminCreateDto.appointmentTime,
    );

    const appointment = this.appointmentsRepository.create({
      ...adminCreateDto,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: adminCreateDto.paymentStatus || PaymentStatus.PAID,
      paymentMethod: adminCreateDto.paymentMethod || PaymentMethod.MANUAL,
      createdByAdmin: true,
    });

    const saved = await this.appointmentsRepository.save(appointment);

    this.logger.log(
      `Turno creado por admin: ${saved.patientName} - ${saved.appointmentDate}`,
    );

    // Enviar confirmación si el turno está confirmado
    if (saved.status === AppointmentStatus.CONFIRMED) {
      try {
        await this.emailService.sendAppointmentConfirmation(
          saved.patientEmail,
          {
            patientName: saved.patientName,
            serviceName: service.name,
            date: saved.appointmentDate.toString(),
            time: saved.appointmentTime,
          },
        );

        saved.confirmationSent = true;
        await this.appointmentsRepository.save(saved);
      } catch (error) {
        this.logger.error('Error enviando email:', error);
      }
    }

    return saved;
  }

  /**
   * Listar turnos con filtros
   */
  async findAll(
    userId?: string,
    status?: AppointmentStatus,
    startDate?: string,
    endDate?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: Appointment[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    const query = this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .leftJoinAndSelect('appointment.user', 'user');

    if (userId) {
      query.andWhere('appointment.userId = :userId', { userId });
    }

    if (status) {
      query.andWhere('appointment.status = :status', { status });
    }

    if (startDate) {
      query.andWhere('appointment.appointmentDate >= :startDate', {
        startDate,
      });
    }
    if (endDate) {
      query.andWhere('appointment.appointmentDate <= :endDate', { endDate });
    }

    query.orderBy('appointment.appointmentDate', 'ASC');
    query.addOrderBy('appointment.appointmentTime', 'ASC');

    const total = await query.getCount();
    const data = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * Obtener un turno por ID
   */
  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id },
      relations: ['service', 'user'],
    });

    if (!appointment) {
      throw new NotFoundException(`Turno con ID ${id} no encontrado`);
    }

    return appointment;
  }

  /**
   * Actualizar turno (solo admin)
   */
  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (
      updateAppointmentDto.appointmentDate ||
      updateAppointmentDto.appointmentTime
    ) {
      const newDate =
        updateAppointmentDto.appointmentDate || appointment.appointmentDate;
      const newTime =
        updateAppointmentDto.appointmentTime || appointment.appointmentTime;

      await this.validateSlotAvailability(newDate.toString(), newTime, id);
    }

    Object.assign(appointment, updateAppointmentDto);
    const updated = await this.appointmentsRepository.save(appointment);

    this.logger.log(`Turno actualizado: ${updated.id}`);
    return updated;
  }

  /**
   * Cancelar turno
   */
  async cancel(
    id: string,
    cancellationReason?: string,
    cancelledBy: 'admin' | 'patient' = 'patient',
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('El turno ya está cancelado');
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('No se puede cancelar un turno completado');
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellationReason = cancellationReason;
    appointment.cancelledBy = cancelledBy;
    appointment.cancelledAt = new Date();

    const cancelled = await this.appointmentsRepository.save(appointment);

    this.logger.log(`Turno cancelado por ${cancelledBy}: ${cancelled.id}`);

    // Enviar email de cancelación
    try {
      await this.emailService.sendAppointmentCancellation(
        cancelled.patientEmail,
        {
          patientName: cancelled.patientName,
          serviceName: cancelled.service.name,
          date: cancelled.appointmentDate.toString(),
          time: cancelled.appointmentTime,
          reason: cancellationReason,
        },
      );
    } catch (error) {
      this.logger.error('Error enviando email de cancelación:', error);
    }

    // Procesar reembolso si aplica
    // Este se procesa manualmente desde PaymentsController.refund()

    return cancelled;
  }

  /**
   * Obtener turnos del día
   */
  async getTodayAppointments(): Promise<Appointment[]> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    return await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .leftJoinAndSelect('appointment.user', 'user')
      .where('appointment.appointmentDate = :date', { date: todayStr })
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.CONFIRMED,
      })
      .orderBy('appointment.appointmentTime', 'ASC')
      .getMany();
  }

  /**
   * Obtener estadísticas
   */
  async getStats(
    startDate?: string,
    endDate?: string,
  ): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    noShow: number;
  }> {
    const query = this.appointmentsRepository.createQueryBuilder('appointment');

    if (startDate) {
      query.andWhere('appointment.appointmentDate >= :startDate', {
        startDate,
      });
    }
    if (endDate) {
      query.andWhere('appointment.appointmentDate <= :endDate', { endDate });
    }

    const total = await query.getCount();
    const pending = await query
      .clone()
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.PENDING,
      })
      .getCount();
    const confirmed = await query
      .clone()
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.CONFIRMED,
      })
      .getCount();
    const cancelled = await query
      .clone()
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.CANCELLED,
      })
      .getCount();
    const completed = await query
      .clone()
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.COMPLETED,
      })
      .getCount();
    const noShow = await query
      .clone()
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.NO_SHOW,
      })
      .getCount();

    return {
      total,
      pending,
      confirmed,
      cancelled,
      completed,
      noShow,
    };
  }

  /**
   * Validar disponibilidad de slot
   */
  private async validateSlotAvailability(
    date: string,
    time: string,
    excludeId?: string,
  ): Promise<void> {
    const query = this.appointmentsRepository
      .createQueryBuilder('appointment')
      .where('appointment.appointmentDate = :date', { date })
      .andWhere('appointment.appointmentTime = :time', { time })
      .andWhere('appointment.status != :cancelledStatus', {
        cancelledStatus: AppointmentStatus.CANCELLED,
      });

    if (excludeId) {
      query.andWhere('appointment.id != :excludeId', { excludeId });
    }

    const existingAppointment = await query.getOne();

    if (existingAppointment) {
      throw new ConflictException(
        'El horario seleccionado ya está ocupado. Por favor, elija otro horario.',
      );
    }
  }

  /**
   * Validar horarios de negocio (Fase 2)
   */
  private async validateBusinessHours(
    date: string,
    time: string,
  ): Promise<void> {
    const dayOfWeek = this.getDayOfWeek(date);

    const businessHours = await this.businessHoursRepository.findOne({
      where: {
        dayOfWeek,
        isActive: true,
      },
    });

    if (!businessHours) {
      throw new BadRequestException(
        `No hay horarios de atención configurados para ${dayOfWeek}`,
      );
    }

    // Verificar que la hora esté dentro del horario de atención
    if (time < businessHours.openTime || time >= businessHours.closeTime) {
      throw new BadRequestException(
        `El horario seleccionado está fuera del horario de atención (${businessHours.openTime} - ${businessHours.closeTime})`,
      );
    }
  }

  /**
   * Validar slots bloqueados (Fase 2)
   */
  private async validateNotBlocked(date: string, time: string): Promise<void> {
    const blockedSlots = await this.blockedSlotsRepository.find({
      where: {
        blockedDate: date as any,
        isActive: true,
      },
    });

    for (const blocked of blockedSlots) {
      // Si no tiene horas específicas, bloquea TODO el día
      if (!blocked.startTime || !blocked.endTime) {
        throw new BadRequestException(
          `El día ${date} está bloqueado: ${blocked.reason || 'No disponible'}`,
        );
      }

      // Verificar si el slot está dentro del rango bloqueado
      if (time >= blocked.startTime && time < blocked.endTime) {
        throw new BadRequestException(
          `El horario ${time} está bloqueado: ${blocked.reason || 'No disponible'}`,
        );
      }
    }
  }

  /**
   * Obtener día de la semana (sin conversión de timezone)
   */
  private getDayOfWeek(dateString: string | Date): DayOfWeek {
    let date: Date;

    if (typeof dateString === 'string') {
      // Parsear manualmente para evitar conversión UTC
      const [year, month, day] = dateString.split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = dateString;
    }

    const days = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];

    const dayIndex = date.getDay();
    const dayName = days[dayIndex];

    // Debug log
    this.logger.debug(
      `📅 Fecha: ${typeof dateString === 'string' ? dateString : date.toISOString().split('T')[0]} → Día de la semana: ${dayName} (index: ${dayIndex})`,
    );

    return dayName;
  }
}
