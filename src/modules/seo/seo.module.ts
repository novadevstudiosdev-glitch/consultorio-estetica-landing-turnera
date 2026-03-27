import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from '../services/entities/service.entity';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [TypeOrmModule.forFeature([Service])],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
