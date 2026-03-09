import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @ApiProperty({
    example: 'uuid-del-turno',
    description: 'ID del turno completado',
  })
  @IsUUID()
  appointmentId: string;

  @ApiProperty({
    example: 5,
    description: 'Calificación de 1 a 5 estrellas',
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1, { message: 'La calificación mínima es 1 estrella' })
  @Max(5, { message: 'La calificación máxima es 5 estrellas' })
  @Type(() => Number)
  rating: number;

  @ApiPropertyOptional({
    example: '¡Excelente atención! Muy profesional y resultados increíbles.',
    description: 'Comentario sobre el servicio (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'El comentario no puede superar 1000 caracteres' })
  comment?: string;

  @ApiPropertyOptional({
    example: 'María González',
    description: 'Nombre del reviewer (opcional, usa el del usuario autenticado si no se provee)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reviewerName?: string;
}

export class UpdateReviewDto extends PartialType(CreateReviewDto) {}

export class ApproveReviewDto {
  @ApiProperty({
    example: true,
    description: 'Aprobar (true) o rechazar (false)',
  })
  @Type(() => Boolean)
  @IsBoolean({ message: 'isApproved debe ser booleano' })
  isApproved: boolean;
}

export class AdminResponseDto {
  @ApiProperty({
    example: '¡Gracias por tu comentario! Nos alegra que hayas disfrutado el tratamiento.',
    description: 'Respuesta del admin a la review',
  })
  @IsString()
  @MaxLength(500)
  adminResponse: string;
}

export class ListReviewsQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Número de página',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Items por página',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar por aprobadas (true) o no aprobadas (false)',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isApproved?: boolean;

  @ApiPropertyOptional({
    example: 5,
    description: 'Filtrar por rating específico',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
