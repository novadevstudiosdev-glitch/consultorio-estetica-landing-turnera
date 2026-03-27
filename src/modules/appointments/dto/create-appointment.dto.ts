import {
  IsString,
  IsEmail,
  IsOptional,
  IsUUID,
  IsDateString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID del servicio a reservar',
  })
  @IsUUID('4', { message: 'El ID del servicio debe ser un UUID válido' })
  serviceId: string;

  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre completo del paciente',
  })
  @IsString({ message: 'El nombre debe ser un texto' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  patientName: string;

  @ApiProperty({
    example: 'juan.perez@gmail.com',
    description: 'Email del paciente',
  })
  @IsEmail({}, { message: 'El email debe ser válido' })
  patientEmail: string;

  @ApiProperty({
    example: '+54 341 1234567',
    description: 'Teléfono del paciente',
  })
  @IsString({ message: 'El teléfono debe ser un texto' })
  @MinLength(8, { message: 'El teléfono debe tener al menos 8 caracteres' })
  patientPhone: string;

  @ApiPropertyOptional({
    example: '35123456',
    description: 'DNI del paciente (opcional)',
  })
  @IsOptional()
  @IsString()
  patientDni?: string;

  @ApiProperty({
    example: '2025-03-15',
    description: 'Fecha del turno (formato: YYYY-MM-DD)',
  })
  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  appointmentDate: string;

  @ApiProperty({
    example: '14:30',
    description: 'Hora del turno (formato: HH:mm)',
  })
  @IsString({ message: 'La hora debe ser un texto' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora debe tener formato HH:mm (ej: 14:30)',
  })
  appointmentTime: string;

  @ApiPropertyOptional({
    example: 'Necesito consultar sobre tratamiento anti-edad',
    description: 'Notas o motivo de consulta del paciente',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Las notas no pueden exceder 1000 caracteres' })
  patientNotes?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'ID de gift card a utilizar (opcional)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la gift card debe ser un UUID válido' })
  giftCardId?: string;

  @ApiPropertyOptional({
    example: 'rosario',
    description: 'Sede del turno: rosario o correa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;
}
