import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemindersService } from './reminders.service';

import { EmailService } from '@/common/services/email.service';
import { WhatsappService } from '@/common/services/whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { Appointment } from '../appointments/entities/appointment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment]),
    // NotificationsModule, // Para enviar notificaciones
  ],
  providers: [RemindersService, EmailService, WhatsappService, ConfigService],
  exports: [RemindersService],
})
export class RemindersModule {}
