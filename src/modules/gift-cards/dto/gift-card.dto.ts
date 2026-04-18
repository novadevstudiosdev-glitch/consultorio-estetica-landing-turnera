import {
  IsString,
  IsNumber,
  IsEmail,
  IsOptional,
  Min,
  Max,
  MaxLength,
  IsPhoneNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PurchaseGiftCardDto {
  @ApiProperty({
    example: 10000,
    description: 'Monto de la gift card en ARS',
    minimum: 1000,
    maximum: 100000,
  })
  @IsNumber()
  @Min(1000, { message: 'El monto mínimo es $1000' })
  @Max(100000, { message: 'El monto máximo es $100000' })
  @Type(() => Number)
  amount: number;

  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre de quien compra la gift card',
  })
  @IsString()
  @MaxLength(255)
  purchaserName: string;

  @ApiProperty({
    example: 'juan@example.com',
    description: 'Email de quien compra',
  })
  @IsEmail({}, { message: 'Email inválido' })
  purchaserEmail: string;

  @ApiPropertyOptional({
    example: '+54 9 341 1234567',
    description: 'Teléfono de quien compra (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  purchaserPhone?: string;

  @ApiProperty({
    example: 'María González',
    description: 'Nombre de quien recibe la gift card',
  })
  @IsString()
  @MaxLength(255)
  recipientName: string;

  @ApiProperty({
    example: 'maria@example.com',
    description: 'Email de quien recibe (se enviará la gift card aquí)',
  })
  @IsEmail({}, { message: 'Email del beneficiario inválido' })
  recipientEmail: string;

  @ApiPropertyOptional({
    example: '+54 9 341 7654321',
    description: 'WhatsApp de quien recibe (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  recipientPhone?: string;

  @ApiPropertyOptional({
    example: '¡Feliz cumpleaños! Espero que disfrutes este regalo.',
    description: 'Mensaje personalizado (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalMessage?: string;
}

export class RedeemGiftCardDto {
  @ApiProperty({
    example: 5000,
    description: 'Monto a canjear (puede ser parcial)',
  })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amountToRedeem: number;

  @ApiPropertyOptional({
    example: 'Usado en tratamiento facial',
    description: 'Notas sobre el canje',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ValidateGiftCardDto {
  @ApiProperty({
    example: 'JG-2026-ABCD1234',
    description: 'Código de la gift card',
  })
  @IsString()
  code: string;
}

export class UpdateGiftCardDto extends PartialType(PurchaseGiftCardDto) {
  @ApiPropertyOptional({
    example: 'Cliente canceló, se reembolsó',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
