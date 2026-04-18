import {
  IsDateString,
  IsEnum,
  IsString,
  IsOptional,
  Matches,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BlockedSlotType } from '../entities/blocked-slot.entity';

export class CreateBlockedSlotDto {
  @ApiProperty({
    example: '2025-12-25',
    description: 'Fecha a bloquear (formato YYYY-MM-DD)',
  })
  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  blockedDate: string;

  @ApiPropertyOptional({
    example: '09:00',
    description:
      'Hora de inicio del bloqueo. Si no se especifica, bloquea TODO el día',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora debe tener formato HH:mm',
  })
  startTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description:
      'Hora de fin del bloqueo. Si no se especifica, bloquea TODO el día',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora debe tener formato HH:mm',
  })
  endTime?: string;

  @ApiPropertyOptional({
    enum: BlockedSlotType,
    example: BlockedSlotType.VACATION,
    description: 'Tipo de bloqueo',
    default: BlockedSlotType.OTHER,
  })
  @IsOptional()
  @IsEnum(BlockedSlotType)
  type?: BlockedSlotType;

  @ApiPropertyOptional({
    example: 'Vacaciones de verano',
    description: 'Razón del bloqueo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBlockedSlotDto extends PartialType(CreateBlockedSlotDto) {}
