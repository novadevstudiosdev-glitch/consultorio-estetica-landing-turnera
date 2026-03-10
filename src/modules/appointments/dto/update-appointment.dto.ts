import { PartialType, OmitType, ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  Matches,
  IsDateString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
} from '../entities/appointment.entity';

// DTO para actualizar (solo admin)
export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @ApiPropertyOptional({
    enum: AppointmentStatus,
    description: 'Estado del turno',
  })
  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'Estado inválido' })
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: 'Estado del pago',
  })
  @IsOptional()
  @IsEnum(PaymentStatus, { message: 'Estado de pago inválido' })
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    example: 'Paciente llegó 10 minutos tarde',
    description: 'Notas internas del admin',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Las notas no pueden exceder 1000 caracteres' })
  notes?: string;
}

// DTO para crear turno como admin (sin validaciones de disponibilidad)
export class AdminCreateAppointmentDto extends CreateAppointmentDto {
  @ApiPropertyOptional({
    example: 'Turno creado por pedido telefónico',
    description: 'Notas internas del admin sobre la creación',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    description:
      'Estado del pago (admin puede marcar como paid si cobró en efectivo)',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.MANUAL,
    description: 'Método de pago',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

// DTO para reagendar turno (solo paciente con turno pendiente)
export class RescheduleAppointmentDto {
  @ApiProperty({
    example: '2026-03-15',
    description: 'Nueva fecha del turno (YYYY-MM-DD)',
  })
  @IsDateString()
  appointmentDate: string;

  @ApiProperty({
    example: '14:30',
    description: 'Nueva hora del turno (HH:mm)',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'appointmentTime debe estar en formato HH:mm',
  })
  appointmentTime: string;

  @ApiPropertyOptional({
    example: 'Cliente solicitó cambio de horario',
    description: 'Razón del cambio (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// DTO para cancelar turno
export class CancelAppointmentDto {
  @ApiPropertyOptional({
    example: 'No puedo asistir por motivos personales',
    description: 'Motivo de la cancelación',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres' })
  cancellationReason?: string;
}
