import {
  IsEnum,
  IsString,
  Matches,
  IsBoolean,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DayOfWeek } from '../entities/business-hours.entity';

export class CreateBusinessHoursDto {
  @ApiPropertyOptional({
    example: 'Rosario',
    description: 'Ubicación/sede para estos horarios',
    default: 'Rosario',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({
    enum: DayOfWeek,
    example: DayOfWeek.MONDAY,
    description: 'Día de la semana',
  })
  @IsEnum(DayOfWeek, { message: 'Día de la semana inválido' })
  dayOfWeek: DayOfWeek;

  @ApiProperty({
    example: '09:00',
    description: 'Hora de apertura (formato HH:mm)',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora de apertura debe tener formato HH:mm',
  })
  openTime: string;

  @ApiProperty({
    example: '18:00',
    description: 'Hora de cierre (formato HH:mm)',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora de cierre debe tener formato HH:mm',
  })
  closeTime: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Duración de cada slot en minutos',
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(15, { message: 'La duración mínima es 15 minutos' })
  @Type(() => Number)
  slotDurationMinutes?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Si está activo',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBusinessHoursDto extends PartialType(
  CreateBusinessHoursDto,
) {}
