import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { User } from '../modules/users/entities/user.entity';
import { PasswordResetToken } from '../modules/users/entities/password-reset-token.entity';
import { EmailVerificationToken } from '../modules/users/entities/email-verification-token.entity';
import { Service } from '../modules/services/entities/service.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { BlockedSlot } from '@/modules/blocked-slots/entities/blocked-slot.entity';
import { BusinessHours } from '@/modules/business-hours/entities/business-hours.entity';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get('DB_HOST'),
  port: configService.get('DB_PORT'),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_NAME'),
  entities: [
    User,
    PasswordResetToken,
    EmailVerificationToken,
    Service,
    Appointment,
    BusinessHours,
    BlockedSlot,
    // Agregar más cuando las crees
  ],
  synchronize: configService.get('NODE_ENV') === 'development',
  logging: configService.get('NODE_ENV') === 'development',

  ssl: {
    rejectUnauthorized: false, // Supabase requiere SSL
  },
});
