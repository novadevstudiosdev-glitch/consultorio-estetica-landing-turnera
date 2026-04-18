import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({
    example: 'ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Token de autenticación de Google (ID Token)',
  })
  @IsString()
  @IsNotEmpty({ message: 'El token de Google es requerido' })
  googleToken: string;

  @ApiProperty({
    example: '6LcxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXX',
    description: 'Token de reCAPTCHA v3',
  })
  @IsString()
  @IsNotEmpty({ message: 'El token de reCAPTCHA es requerido' })
  recaptchaToken: string;
}
