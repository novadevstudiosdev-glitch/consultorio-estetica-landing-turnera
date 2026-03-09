import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftCardsService } from './gift-cards.service';
import { GiftCardsController } from './gift-cards.controller';
import { GiftCard } from './entities/gift-card.entity';
import { EmailService } from '../../common/services/email.service';
import { GiftCardPdfService } from './gift-card-pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GiftCard]),
    // EmailService se provee como provider, no como módulo
  ],
  controllers: [GiftCardsController],
  providers: [GiftCardsService, GiftCardPdfService, EmailService],
  exports: [GiftCardsService],
})
export class GiftCardsModule {}
