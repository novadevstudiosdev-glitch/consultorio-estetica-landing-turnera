import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AppointmentsModule } from '../appointments/appointments.module';
import { WhatsappService } from '../../common/services/whatsapp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment]),
    AppointmentsModule, // Para usar AppointmentsService
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, WhatsappService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
