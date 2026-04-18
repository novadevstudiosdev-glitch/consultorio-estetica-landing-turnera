import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateServiceDto {
  @ApiProperty({
    example: 'Ecografía Cutánea',
    description: 'Nombre del servicio médico',
  })
  @IsString({ message: 'El nombre debe ser un texto' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example:
      'Análisis detallado de la piel mediante ultrasonido de alta frecuencia',
    description: 'Descripción completa del servicio',
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser un texto' })
  description?: string;

  @ApiProperty({
    example: 60,
    description: 'Duración del servicio en minutos',
    minimum: 15,
  })
  @IsInt({ message: 'La duración debe ser un número entero' })
  @Min(15, { message: 'La duración mínima es 15 minutos' })
  @Type(() => Number)
  durationMinutes: number;

  @ApiProperty({
    example: 15000,
    description: 'Precio total del servicio en pesos argentinos',
    minimum: 0,
  })
  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  @Type(() => Number)
  price: number;

  @ApiProperty({
    example: 3000,
    description: 'Monto de la seña requerida para reservar',
    minimum: 0,
  })
  @IsNumber({}, { message: 'El monto de seña debe ser un número' })
  @Min(0, { message: 'El monto de seña no puede ser negativo' })
  @Type(() => Number)
  depositAmount: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Orden de visualización en el listado',
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero' })
  @Type(() => Number)
  displayOrder?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Si el servicio está activo y visible',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}
