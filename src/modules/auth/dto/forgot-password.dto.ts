import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'juan.perez@gmail.com',
    description: 'Email de la cuenta a recuperar',
  })
  @IsEmail({}, { message: 'El email debe ser válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @ApiProperty({
    example: '6LcxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXX',
    description: 'Token de reCAPTCHA v3',
  })
  @IsString()
  @IsNotEmpty({ message: 'El token de reCAPTCHA es requerido' })
  recaptchaToken: string;
}
