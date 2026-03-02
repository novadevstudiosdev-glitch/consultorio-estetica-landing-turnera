import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { Appointment } from './entities/appointment.entity';
import { ServicesModule } from '../services/services.module';
import { Service } from '../services/entities/service.entity';
import { BusinessHours } from '../business-hours/entities/business-hours.entity';
import { BlockedSlot } from '../blocked-slots/entities/blocked-slot.entity';
import { SlotsService } from './slots.service';
import { EmailService } from '@/common/services/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      BusinessHours, // Para SlotsService
      BlockedSlot, // Para SlotsService
      Service, // Para SlotsService
    ]),
    ServicesModule, // Importar para usar ServicesService
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, SlotsService, EmailService],
  exports: [AppointmentsService, SlotsService], // Exportar para usar en otros módulos
})
export class AppointmentsModule {}
