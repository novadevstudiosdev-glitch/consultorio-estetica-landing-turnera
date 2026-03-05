import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { getDatabaseConfig } from './config/database.config';

// Import all feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ServicesModule } from './modules/services/services.module';
import { ProductsModule } from './modules/products/products.module';
import { BrandsModule } from './modules/brands/brands.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockedSlotsModule } from './modules/blocked-slots/blocked-slots.module';
import { BusinessHoursModule } from './modules/business-hours/business-hours.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { GiftCardsModule } from './modules/gift-cards/gift-cards.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // Schedule (for cron jobs)
    ScheduleModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 10,
      },
    ]),

    // Feature modules
    AuthModule,
    UsersModule,
    ServicesModule,
    ProductsModule,
    BrandsModule,
    AppointmentsModule,
    BusinessHoursModule,
    BlockedSlotsModule,
    NotificationsModule,
    PaymentsModule,
    RemindersModule,
    GiftCardsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
