import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BlockedSlotType } from '../entities/blocked-slot.entity';

export class BlockRangeDto {
  @ApiProperty({
    example: '2026-07-01',
    description: 'Fecha de inicio (YYYY-MM-DD)',
  })
  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({
    example: '2026-07-10',
    description: 'Fecha de fin (YYYY-MM-DD)',
  })
  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  endDate: string;

  @ApiProperty({
    enum: BlockedSlotType,
    example: BlockedSlotType.VACATION,
    description: 'Tipo de bloqueo',
    default: BlockedSlotType.OTHER,
  })
  @IsEnum(BlockedSlotType, {
    message: 'El tipo debe ser uno de los valores permitidos',
  })
  type: BlockedSlotType;

  @ApiProperty({ example: 'Vacaciones de invierno', required: false })
  @IsOptional()
  @IsString({ message: 'La razón debe ser un texto' })
  @MaxLength(500)
  reason?: string;
}
