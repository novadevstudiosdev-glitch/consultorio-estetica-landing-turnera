import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  RescheduleAppointmentDto,
} from './dto/update-appointment.dto';
import { ServicesService } from '../services/services.service';
import {
  BusinessHours,
  DayOfWeek,
} from '../business-hours/entities/business-hours.entity';
import { BlockedSlot } from '../blocked-slots/entities/blocked-slot.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { EmailService } from '../../common/services/email.service';
import { WhatsappService } from '../../common/services/whatsapp.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);
  private static readonly DEFAULT_PENDING_TTL_MINUTES = 15;

  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(BusinessHours)
    private businessHoursRepository: Repository<BusinessHours>,
    @InjectRepository(BlockedSlot)
    private blockedSlotsRepository: Repository<BlockedSlot>,
    private configService: ConfigService,
    private servicesService: ServicesService,
    private emailService: EmailService,
    private whatsappService: WhatsappService,
  ) {}

  /**
   * Crear un turno (público - con validación de disponibilidad)
   */
  async create(
    createAppointmentDto: CreateAppointmentDto,
    userId?: string,
  ): Promise<Appointment> {
    await this.cancelExpiredPendingAppointments();

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

    return saved;
  }

  /**
   * Crear turno como admin (sin validaciones estrictas)
   */
  async createAsAdmin(
    adminCreateDto: AdminCreateAppointmentDto,
    adminId: string,
  ): Promise<Appointment> {
    await this.cancelExpiredPendingAppointments();

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
    if (saved.status === AppointmentStatus.CONFIRMED && saved.patientEmail) {
      try {
        const confirmationSent =
          await this.emailService.sendAppointmentConfirmation(
            saved.patientEmail,
            {
              patientName: saved.patientName,
              serviceName: service.name,
              date: saved.appointmentDate.toString(),
              time: saved.appointmentTime,
              location: saved.location,
            },
          );

        if (confirmationSent && !saved.confirmationSent) {
          saved.confirmationSent = true;
          await this.appointmentsRepository.save(saved);
        }
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
    const previousStatus = appointment.status;

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
    const transitionedToConfirmed = this.didTransitionToConfirmed(
      previousStatus,
      updated.status,
    );
    this.logger.log(
      `[WA-DIAG][appointments.update] appointmentId=${updated.id} previousStatus=${previousStatus} nextStatus=${updated.status} transitionedToConfirmed=${transitionedToConfirmed}`,
    );

    if (transitionedToConfirmed) {
      try {
        this.logger.log(
          `[WA-DIAG][appointments.update] attempting sendAppointmentCreated appointmentId=${updated.id} patientPhone="${updated.patientPhone ?? ''}" doctorPhoneFallback="${this.configService.get<string>('DOCTOR_PHONE') ?? this.configService.get<string>('TWILIO_WHATSAPP_TO') ?? ''}"`,
        );
        await this.whatsappService.sendAppointmentCreated({
          appointmentId: updated.id,
          patientName: updated.patientName,
          patientPhone: updated.patientPhone,
          serviceName: updated.service?.name ?? 'Turno',
          date: this.formatAppointmentDate(updated.appointmentDate),
          time: updated.appointmentTime,
        });
      } catch (error) {
        this.logger.error(
          `Error enviando WhatsApp por cambio de estado a confirmado para turno ${updated.id}`,
          error,
        );
      }

      try {
        if (!updated.confirmationSent) {
          const confirmationSent =
            await this.emailService.sendAppointmentConfirmation(
              updated.patientEmail,
              {
                patientName: updated.patientName,
                serviceName: updated.service?.name ?? 'Turno',
                date: updated.appointmentDate.toString(),
                time: updated.appointmentTime,
                depositAmount: updated.service?.depositAmount,
                location: updated.location,
              },
            );

          if (confirmationSent) {
            updated.confirmationSent = true;
            await this.appointmentsRepository.save(updated);
          }
        }
      } catch (error) {
        this.logger.error(
          `Error enviando email de confirmacion para turno ${updated.id}`,
          error,
        );
      }
    }

    this.logger.log(`Turno actualizado: ${updated.id}`);
    return updated;
  }

  /**
   * Reprogramar turno
   */
  async reschedule(
    id: string,
    rescheduleDto: RescheduleAppointmentDto,
    user?: User,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);
    await this.cancelExpiredPendingAppointments();

    // Verificar permisos
    if (user) {
      const isAdmin = user.role === UserRole.ADMIN;
      const isOwner = appointment.patientEmail === user.email;

      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(
          'No tienes permiso para reprogramar este turno',
        );
      }
    } else {
      // Sin autenticación, no puede reprogramar
      throw new UnauthorizedException(
        'Debes iniciar sesión para reprogramar un turno',
      );
    }

    // Validar que el turno no esté cancelado o completado
    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede reprogramar un turno cancelado',
      );
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'No se puede reprogramar un turno completado',
      );
    }

    // Validar que la nueva fecha/hora sea futura
    const now = new Date();
    const newDateTime = new Date(
      `${rescheduleDto.appointmentDate}T${rescheduleDto.appointmentTime}`,
    );

    if (newDateTime <= now) {
      throw new BadRequestException(
        'La nueva fecha y hora deben ser en el futuro',
      );
    }

    // Validar horarios de negocio
    await this.validateBusinessHours(
      rescheduleDto.appointmentDate,
      rescheduleDto.appointmentTime,
    );

    // Validar slots bloqueados
    await this.validateNotBlocked(
      rescheduleDto.appointmentDate,
      rescheduleDto.appointmentTime,
    );

    // Validar disponibilidad (que no haya otro turno en ese slot)
    await this.validateSlotAvailability(
      rescheduleDto.appointmentDate,
      rescheduleDto.appointmentTime,
      id,
    );

    // Guardar fecha/hora anterior para el email
    const previousDate =
      appointment.appointmentDate instanceof Date
        ? appointment.appointmentDate.toISOString().split('T')[0]
        : String(appointment.appointmentDate);
    const previousTime = appointment.appointmentTime;

    // Actualizar fecha y hora
    appointment.appointmentDate = rescheduleDto.appointmentDate as any;
    appointment.appointmentTime = rescheduleDto.appointmentTime;

    // Agregar notas sobre el cambio
    const changeNote = `[${new Date().toISOString()}] Reprogramado de ${previousDate} ${previousTime} a ${rescheduleDto.appointmentDate} ${rescheduleDto.appointmentTime}${rescheduleDto.reason ? ` - Razón: ${rescheduleDto.reason}` : ''}`;
    appointment.notes = appointment.notes
      ? `${appointment.notes}\n${changeNote}`
      : changeNote;

    const updated = await this.appointmentsRepository.save(appointment);

    // Enviar email de notificación del cambio
    try {
      await this.emailService.sendAppointmentRescheduled(
        appointment.patientEmail,
        {
          patientName: appointment.patientName,
          serviceName: appointment.service.name,
          previousDate,
          previousTime,
          newDate: rescheduleDto.appointmentDate,
          newTime: rescheduleDto.appointmentTime,
          reason: rescheduleDto.reason,
        },
      );

      this.logger.log(
        `📧 Email de reprogramación enviado a ${appointment.patientEmail}`,
      );
    } catch (error) {
      this.logger.error('Error enviando email de reprogramación:', error);
      // No bloquea la reprogramación
    }

    this.logger.log(
      `📅 Turno reprogramado: ${id} - De ${previousDate} ${previousTime} a ${rescheduleDto.appointmentDate} ${rescheduleDto.appointmentTime}`,
    );

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
    const previousStatus = appointment.status;

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
    const transitionedFromConfirmedToCancelled =
      this.didTransitionFromConfirmedToCancelled(previousStatus, cancelled.status);
    this.logger.log(
      `[WA-DIAG][appointments.cancel] appointmentId=${cancelled.id} previousStatus=${previousStatus} nextStatus=${cancelled.status} transitionedFromConfirmedToCancelled=${transitionedFromConfirmedToCancelled}`,
    );

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
    if (transitionedFromConfirmedToCancelled) {
      try {
        this.logger.log(
          `[WA-DIAG][appointments.cancel] attempting sendAppointmentCancelled appointmentId=${cancelled.id} patientPhone="${cancelled.patientPhone ?? ''}" doctorPhoneFallback="${this.configService.get<string>('DOCTOR_PHONE') ?? this.configService.get<string>('TWILIO_WHATSAPP_TO') ?? ''}"`,
        );
        await this.whatsappService.sendAppointmentCancelled({
          appointmentId: cancelled.id,
          patientName: cancelled.patientName,
          patientPhone: cancelled.patientPhone,
          serviceName: cancelled.service.name,
          date: this.formatAppointmentDate(cancelled.appointmentDate),
          time: cancelled.appointmentTime,
          cancellationReason,
        });
      } catch (error) {
        this.logger.error(
          'Error enviando WhatsApp de cancelación de turno al cliente/doctora:',
          error,
        );
      }
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

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingExpirationCron(): Promise<void> {
    try {
      await this.cancelExpiredPendingAppointments();
    } catch (error) {
      this.logger.error('Error cancelando turnos pendientes vencidos', error);
    }
  }

  async cancelExpiredPendingAppointments(): Promise<number> {
    const pendingTtlMinutes = this.getPendingTtlMinutes();
    const expiredAppointments = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .where('appointment.status = :pendingStatus', {
        pendingStatus: AppointmentStatus.PENDING,
      })
      .andWhere('appointment.paymentStatus = :pendingPaymentStatus', {
        pendingPaymentStatus: PaymentStatus.PENDING,
      })
      .andWhere(
        "appointment.createdAt <= (NOW() - (:pendingTtlMinutes * INTERVAL '1 minute'))",
        { pendingTtlMinutes },
      )
      .getMany();

    if (expiredAppointments.length === 0) {
      return 0;
    }

    const now = new Date();
    const reason = `Reserva vencida automaticamente por falta de pago (${this.getPendingTtlMinutes()} minutos)`;

    for (const appointment of expiredAppointments) {
      appointment.status = AppointmentStatus.CANCELLED;
      appointment.cancellationReason = reason;
      appointment.cancelledBy = 'system';
      appointment.cancelledAt = now;
    }

    await this.appointmentsRepository.save(expiredAppointments);

    this.logger.log(
      `Turnos pendientes vencidos cancelados: ${expiredAppointments.length}`,
    );

    return expiredAppointments.length;
  }

  /**
   * Validar disponibilidad de slot
   */
  private async validateSlotAvailability(
    date: string,
    time: string,
    excludeId?: string,
  ): Promise<void> {
    const pendingTtlMinutes = this.getPendingTtlMinutes();

    const query = this.appointmentsRepository
      .createQueryBuilder('appointment')
      .where('appointment.appointmentDate = :date', { date })
      .andWhere('appointment.appointmentTime = :time', { time })
      .andWhere('appointment.status != :cancelledStatus', {
        cancelledStatus: AppointmentStatus.CANCELLED,
      })
      .andWhere(
        "(appointment.status != :pendingStatus OR appointment.createdAt > (NOW() - (:pendingTtlMinutes * INTERVAL '1 minute')))",
        {
          pendingStatus: AppointmentStatus.PENDING,
          pendingTtlMinutes,
        },
      );

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
    const selectedTimeMinutes = this.timeToMinutes(this.normalizeTime(time));
    const openTimeMinutes = this.timeToMinutes(businessHours.openTime);
    const closeTimeMinutes = this.timeToMinutes(businessHours.closeTime);

    if (
      selectedTimeMinutes === null ||
      openTimeMinutes === null ||
      closeTimeMinutes === null
    ) {
      throw new BadRequestException('Horario invalido');
    }

    if (
      selectedTimeMinutes < openTimeMinutes ||
      selectedTimeMinutes >= closeTimeMinutes
    ) {
      throw new BadRequestException(
        `El horario seleccionado está fuera del horario de atención (${businessHours.openTime} - ${businessHours.closeTime})`,
      );
    }
  }

  /**
   * Validar slots bloqueados (Fase 2)
   */
  private async validateNotBlocked(date: string, time: string): Promise<void> {
    const selectedTimeMinutes = this.timeToMinutes(this.normalizeTime(time));

    if (selectedTimeMinutes === null) {
      throw new BadRequestException('Horario invalido');
    }

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
      const blockedStartMinutes = this.timeToMinutes(blocked.startTime);
      const blockedEndMinutes = this.timeToMinutes(blocked.endTime);

      if (blockedStartMinutes === null || blockedEndMinutes === null) {
        continue;
      }

      if (
        selectedTimeMinutes >= blockedStartMinutes &&
        selectedTimeMinutes < blockedEndMinutes
      ) {
        throw new BadRequestException(
          `El horario ${time} está bloqueado: ${blocked.reason || 'No disponible'}`,
        );
      }
    }
  }

  /**
   * Obtener día de la semana (sin conversión de timezone)
   */
  /**
   * Normalize HH:mm:ss to HH:mm.
   */
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

  private formatAppointmentDate(date: string | Date): string {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }

    const raw = String(date ?? '').trim();
    return raw.length > 0 ? raw : 'Sin fecha';
  }

  private didTransitionToConfirmed(
    previousStatus: AppointmentStatus,
    nextStatus: AppointmentStatus,
  ): boolean {
    return (
      previousStatus === AppointmentStatus.PENDING &&
      nextStatus === AppointmentStatus.CONFIRMED
    );
  }

  private didTransitionFromConfirmedToCancelled(
    previousStatus: AppointmentStatus,
    nextStatus: AppointmentStatus,
  ): boolean {
    return (
      previousStatus === AppointmentStatus.CONFIRMED &&
      nextStatus === AppointmentStatus.CANCELLED
    );
  }

  private getPendingTtlMinutes(): number {
    const raw =
      this.configService.get<string>('PENDING_APPOINTMENT_TTL_MINUTES') ??
      AppointmentsService.DEFAULT_PENDING_TTL_MINUTES.toString();
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return AppointmentsService.DEFAULT_PENDING_TTL_MINUTES;
    }

    return Math.floor(parsed);
  }

  /**
   * Obtener dí­a de la semana (sin conversión de timezone)
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
