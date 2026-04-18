import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderServicesDto {
  @ApiProperty({
    description: 'Array de IDs de servicios en el nuevo orden deseado',
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
    ],
    type: [String],
  })
  @IsArray({ message: 'serviceIds debe ser un array' })
  @ArrayMinSize(1, { message: 'Debe proporcionar al menos un servicio' })
  @IsUUID('4', { each: true, message: 'Cada ID debe ser un UUID válido' })
  serviceIds: string[];
}
