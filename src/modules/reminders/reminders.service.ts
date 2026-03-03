import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
// import { NotificationsModule } from '../notifications/notifications.module';
import { EmailService } from '@/common/services/email.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    private emailService: EmailService,
  ) {}

  /**
   * Cron que corre cada hora para enviar recordatorios 24h antes
   */
  @Cron(CronExpression.EVERY_HOUR)
  async send24HourReminders() {
    this.logger.log('⏰ Ejecutando cron de recordatorios 24h...');

    try {
      // Calcular rango: dentro de 24-25 horas
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      const tomorrowDate = in24Hours.toISOString().split('T')[0];

      // Buscar turnos confirmados para mañana que NO hayan recibido recordatorio
      const appointments = await this.appointmentsRepository
        .createQueryBuilder('appointment')
        .leftJoinAndSelect('appointment.service', 'service')
        .where('appointment.appointmentDate = :date', { date: tomorrowDate })
        .andWhere('appointment.status = :status', {
          status: AppointmentStatus.CONFIRMED,
        })
        .andWhere('appointment.reminder24hSent = :sent', { sent: false })
        .getMany();

      this.logger.log(
        `📋 Encontrados ${appointments.length} turnos para recordatorios 24h`,
      );

      for (const appointment of appointments) {
        try {
          // Enviar email
          await this.emailService.sendAppointmentReminder(
            appointment.patientEmail,
            {
              patientName: appointment.patientName,
              serviceName: appointment.service.name,
              date: appointment.appointmentDate.toString(),
              time: appointment.appointmentTime,
            },
          );

          // Marcar como enviado
          appointment.reminder24hSent = true;
          await this.appointmentsRepository.save(appointment);

          this.logger.log(
            `✅ Recordatorio 24h enviado: ${appointment.patientEmail}`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Error enviando recordatorio 24h a ${appointment.patientEmail}:`,
            error,
          );
        }
      }

      this.logger.log(
        `✅ Cron completado: ${appointments.length} recordatorios enviados`,
      );
    } catch (error) {
      this.logger.error('❌ Error en cron de recordatorios 24h:', error);
    }
  }

  /**
   * Cron que corre cada 30 minutos para enviar recordatorios 2h antes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async send2HourReminders() {
    this.logger.log('⏰ Ejecutando cron de recordatorios 2h...');

    try {
      // Calcular rango: dentro de 2-2.5 horas
      const now = new Date();
      const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const in2HoursPlus30 = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);

      const todayDate = now.toISOString().split('T')[0];
      const targetTime = in2Hours.toTimeString().split(' ')[0].substring(0, 5); // HH:mm

      // Buscar turnos confirmados para hoy en las próximas 2h que NO hayan recibido recordatorio
      const appointments = await this.appointmentsRepository
        .createQueryBuilder('appointment')
        .leftJoinAndSelect('appointment.service', 'service')
        .where('appointment.appointmentDate = :date', { date: todayDate })
        .andWhere('appointment.appointmentTime >= :minTime', {
          minTime: targetTime,
        })
        .andWhere('appointment.status = :status', {
          status: AppointmentStatus.CONFIRMED,
        })
        .andWhere('appointment.reminder2hSent = :sent', { sent: false })
        .getMany();

      this.logger.log(
        `📋 Encontrados ${appointments.length} turnos para recordatorios 2h`,
      );

      for (const appointment of appointments) {
        // Verificar que realmente esté dentro del rango de 2-2.5h
        const appointmentDateTime = new Date(
          `${appointment.appointmentDate}T${appointment.appointmentTime}`,
        );

        if (
          appointmentDateTime >= in2Hours &&
          appointmentDateTime <= in2HoursPlus30
        ) {
          try {
            // Enviar email
            await this.emailService.sendAppointmentReminder(
              appointment.patientEmail,
              {
                patientName: appointment.patientName,
                serviceName: appointment.service.name,
                date: appointment.appointmentDate.toString(),
                time: appointment.appointmentTime,
              },
            );

            // Marcar como enviado
            appointment.reminder2hSent = true;
            await this.appointmentsRepository.save(appointment);

            this.logger.log(
              `✅ Recordatorio 2h enviado: ${appointment.patientEmail}`,
            );
          } catch (error) {
            this.logger.error(
              `❌ Error enviando recordatorio 2h a ${appointment.patientEmail}:`,
              error,
            );
          }
        }
      }

      this.logger.log(`✅ Cron completado: recordatorios 2h procesados`);
    } catch (error) {
      this.logger.error('❌ Error en cron de recordatorios 2h:', error);
    }
  }

  /**
   * Cron diario para marcar turnos pasados como completados o no_show
   * Corre a las 23:00 todos los días
   */
  @Cron('0 23 * * *')
  async markPastAppointments() {
    this.logger.log('⏰ Ejecutando cron de actualización de turnos pasados...');

    try {
      const today = new Date().toISOString().split('T')[0];

      // Buscar turnos confirmados de días anteriores
      const pastAppointments = await this.appointmentsRepository
        .createQueryBuilder('appointment')
        .where('appointment.appointmentDate < :today', { today })
        .andWhere('appointment.status = :status', {
          status: AppointmentStatus.CONFIRMED,
        })
        .getMany();

      this.logger.log(
        `📋 Encontrados ${pastAppointments.length} turnos pasados`,
      );

      for (const appointment of pastAppointments) {
        // Por defecto marcar como completado
        // El admin puede cambiar a no_show manualmente si el paciente no asistió
        appointment.status = AppointmentStatus.COMPLETED;
        await this.appointmentsRepository.save(appointment);
      }

      this.logger.log(
        `✅ ${pastAppointments.length} turnos marcados como completados`,
      );
    } catch (error) {
      this.logger.error('❌ Error marcando turnos pasados:', error);
    }
  }
}
