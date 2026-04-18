import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { EmailVerificationToken } from '../users/entities/email-verification-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RecaptchaService } from '../../common/services/recaptcha.service';
import { EmailService } from '../../common/services/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PasswordResetToken,
      EmailVerificationToken,
    ]),
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const expirationValue =
          configService.get<string>('JWT_EXPIRATION') || '7d';
        const expiresIn: any = !isNaN(Number(expirationValue))
          ? Number(expirationValue)
          : expirationValue;

        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RecaptchaService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
