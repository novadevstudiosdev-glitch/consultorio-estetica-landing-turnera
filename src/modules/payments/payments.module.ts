import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AppointmentsModule } from '../appointments/appointments.module';
import { GiftCardsModule } from '../gift-cards/gift-cards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment]),
    AppointmentsModule, // Para usar AppointmentsService
    GiftCardsModule, // Para usar GiftCardsService
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
