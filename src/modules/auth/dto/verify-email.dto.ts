import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
    description: 'Token de verificación de email recibido por correo',
  })
  @IsString()
  @IsNotEmpty({ message: 'El token es requerido' })
  token: string;
}
