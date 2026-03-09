import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GiftCard, GiftCardStatus } from './entities/gift-card.entity';
import {
  PurchaseGiftCardDto,
  RedeemGiftCardDto,
  UpdateGiftCardDto,
} from './dto/gift-card.dto';
import { EmailService } from '../../common/services/email.service';

@Injectable()
export class GiftCardsService {
  private readonly logger = new Logger(GiftCardsService.name);

  constructor(
    @InjectRepository(GiftCard)
    private giftCardsRepository: Repository<GiftCard>,
    private emailService: EmailService,
  ) {}

  /**
   * Generar código único para gift card
   */
  private generateCode(): string {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `JG-${year}-${random}`;
  }

  /**
   * Calcular fecha de expiración (90 días)
   */
  private calculateExpirationDate(purchaseDate: Date): Date {
    const expiration = new Date(purchaseDate);
    expiration.setDate(expiration.getDate() + 90);
    return expiration;
  }

  /**
   * Crear gift card (aún sin pagar)
   */
  async create(purchaseDto: PurchaseGiftCardDto): Promise<GiftCard> {
    const code = this.generateCode();

    const giftCard = this.giftCardsRepository.create({
      code,
      amount: purchaseDto.amount,
      remainingAmount: purchaseDto.amount,
      status: GiftCardStatus.PENDING,
      purchaserName: purchaseDto.purchaserName,
      purchaserEmail: purchaseDto.purchaserEmail,
      purchaserPhone: purchaseDto.purchaserPhone,
      recipientName: purchaseDto.recipientName,
      recipientEmail: purchaseDto.recipientEmail,
      recipientPhone: purchaseDto.recipientPhone,
      personalMessage: purchaseDto.personalMessage,
    });

    const saved = await this.giftCardsRepository.save(giftCard);
    this.logger.log(`🎁 Gift Card creada: ${code} - $${purchaseDto.amount}`);

    return saved;
  }

  /**
   * Activar gift card después del pago
   */
  async activate(
    giftCardId: string,
    paymentId: string,
    paymentStatus: string,
  ): Promise<GiftCard> {
    const giftCard = await this.giftCardsRepository.findOne({
      where: { id: giftCardId },
    });

    if (!giftCard) {
      throw new NotFoundException('Gift Card no encontrada');
    }

    if (paymentStatus === 'approved') {
      const now = new Date();
      const expirationDate = this.calculateExpirationDate(now);

      // Idempotencia a nivel DB para evitar dobles envios con webhooks concurrentes.
      const activationResult = await this.giftCardsRepository
        .createQueryBuilder()
        .update(GiftCard)
        .set({
          status: GiftCardStatus.ACTIVE,
          paymentId,
          paymentStatus: paymentStatus,
          purchaseDate: now,
          expirationDate,
        })
        .where('id = :id', { id: giftCardId })
        .andWhere(
          '(status != :activeStatus OR payment_status != :approvedStatus)',
          {
            activeStatus: GiftCardStatus.ACTIVE,
            approvedStatus: 'approved',
          },
        )
        .execute();

      if ((activationResult.affected ?? 0) === 0) {
        this.logger.log(
          `Webhook duplicado ignorado para gift card ${giftCard.code} (paymentId: ${paymentId})`,
        );
        return giftCard;
      }

      const activated = await this.giftCardsRepository.findOne({
        where: { id: giftCardId },
      });

      if (!activated) {
        throw new NotFoundException('Gift Card no encontrada tras activacion');
      }

      try {
        await this.emailService.sendGiftCardEmail(activated.recipientEmail, {
          recipientName: activated.recipientName,
          code: activated.code,
          amount: activated.amount,
          expirationDate: activated.expirationDate!.toISOString().split('T')[0],
          purchaserName: activated.purchaserName,
          personalMessage: activated.personalMessage,
        });

        this.logger.log(`Gift Card enviada a ${activated.recipientEmail}`);

        const purchaserEmail = activated.purchaserEmail?.trim().toLowerCase();
        const recipientEmail = activated.recipientEmail?.trim().toLowerCase();

        if (purchaserEmail && purchaserEmail !== recipientEmail) {
          await this.emailService.sendGiftCardPurchaseConfirmation(
            activated.purchaserEmail,
            {
              purchaserName: activated.purchaserName,
              recipientName: activated.recipientName,
              code: activated.code,
              amount: Number(activated.amount),
              expirationDate: activated.expirationDate!.toISOString().split('T')[0],
            },
          );

          this.logger.log(
            `Confirmacion de compra enviada a ${activated.purchaserEmail}`,
          );
        } else {
          this.logger.log(
            `Se omite email de compra: purchaserEmail y recipientEmail son iguales (${activated.recipientEmail})`,
          );
        }
      } catch (error) {
        this.logger.error('Error enviando email de gift card:', error);
      }

      this.logger.log(`Gift Card activada: ${activated.code}`);
      return activated;
    }

    giftCard.paymentStatus = paymentStatus;
    return await this.giftCardsRepository.save(giftCard);
  }
  /**
   * Listar gift cards (admin)
   */
  async findAll(
    status?: GiftCardStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: GiftCard[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    const query = this.giftCardsRepository
      .createQueryBuilder('giftCard')
      .leftJoinAndSelect('giftCard.redeemedByUser', 'user');

    if (status) {
      query.andWhere('giftCard.status = :status', { status });
    }

    query.orderBy('giftCard.createdAt', 'DESC');

    const total = await query.getCount();
    const data = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * Obtener gift card por código
   */
  async findByCode(code: string): Promise<GiftCard> {
    const giftCard = await this.giftCardsRepository.findOne({
      where: { code },
      relations: ['redeemedByUser'],
    });

    if (!giftCard) {
      throw new NotFoundException(`Gift Card con código ${code} no encontrada`);
    }

    return giftCard;
  }

  /**
   * Validar gift card (ver si es válida y cuánto saldo tiene)
   */
  async validate(code: string): Promise<{
    valid: boolean;
    giftCard?: GiftCard;
    message: string;
  }> {
    try {
      const giftCard = await this.findByCode(code);

      // Verificar si está expirada
      if (giftCard.expirationDate && new Date() > giftCard.expirationDate) {
        return {
          valid: false,
          giftCard,
          message: 'Gift Card expirada',
        };
      }

      // Verificar estado
      if (
        giftCard.status === GiftCardStatus.ACTIVE &&
        giftCard.remainingAmount > 0
      ) {
        return {
          valid: true,
          giftCard,
          message: `Válida - Saldo: $${giftCard.remainingAmount}`,
        };
      }

      if (giftCard.status === GiftCardStatus.REDEEMED) {
        return {
          valid: false,
          giftCard,
          message: 'Gift Card ya canjeada completamente',
        };
      }

      return {
        valid: false,
        giftCard,
        message: `Estado: ${giftCard.status}`,
      };
    } catch (error) {
      return {
        valid: false,
        message: 'Código no encontrado',
      };
    }
  }

  /**
   * Canjear gift card (total o parcial)
   */
  async redeem(
    code: string,
    redeemDto: RedeemGiftCardDto,
    adminId: string,
  ): Promise<GiftCard> {
    const giftCard = await this.findByCode(code);

    // Validaciones
    if (giftCard.status !== GiftCardStatus.ACTIVE) {
      throw new BadRequestException(
        `No se puede canjear - Estado: ${giftCard.status}`,
      );
    }

    if (giftCard.expirationDate && new Date() > giftCard.expirationDate) {
      throw new BadRequestException('Gift Card expirada');
    }

    if (redeemDto.amountToRedeem > giftCard.remainingAmount) {
      throw new BadRequestException(
        `Monto a canjear ($${redeemDto.amountToRedeem}) excede el saldo ($${giftCard.remainingAmount})`,
      );
    }

    // Actualizar saldo
    giftCard.remainingAmount -= redeemDto.amountToRedeem;

    // Si se canjeó todo, marcar como REDEEMED
    if (giftCard.remainingAmount === 0) {
      giftCard.status = GiftCardStatus.REDEEMED;
      giftCard.redeemedDate = new Date();
      giftCard.redeemedByUserId = adminId;
    }

    // Agregar notas
    const newNote = `[${new Date().toISOString()}] Canjeado $${redeemDto.amountToRedeem} - ${redeemDto.notes || 'Sin notas'}`;
    giftCard.notes = giftCard.notes ? `${giftCard.notes}\n${newNote}` : newNote;

    const updated = await this.giftCardsRepository.save(giftCard);

    this.logger.log(
      `💸 Gift Card canjeada: ${code} - $${redeemDto.amountToRedeem} - Saldo restante: $${updated.remainingAmount}`,
    );

    return updated;
  }

  /**
   * Actualizar gift card (admin)
   */
  async update(code: string, updateDto: UpdateGiftCardDto): Promise<GiftCard> {
    const giftCard = await this.findByCode(code);

    Object.assign(giftCard, updateDto);
    return await this.giftCardsRepository.save(giftCard);
  }

  /**
   * Cancelar/Reembolsar gift card
   */
  async cancel(code: string, reason: string): Promise<GiftCard> {
    const giftCard = await this.findByCode(code);

    giftCard.status = GiftCardStatus.CANCELLED;
    giftCard.notes = giftCard.notes
      ? `${giftCard.notes}\n[CANCELADA] ${reason}`
      : `[CANCELADA] ${reason}`;

    const cancelled = await this.giftCardsRepository.save(giftCard);

    this.logger.log(`❌ Gift Card cancelada: ${code}`);
    return cancelled;
  }

  /**
   * Obtener gift card por ID
   */
  async findOne(id: string): Promise<GiftCard> {
    const giftCard = await this.giftCardsRepository.findOne({
      where: { id },
      relations: ['redeemedByUser'],
    });

    if (!giftCard) {
      throw new NotFoundException(`Gift Card con ID ${id} no encontrada`);
    }

    return giftCard;
  }

  /**
   * Estadísticas de gift cards
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    redeemed: number;
    expired: number;
    totalAmount: number;
    totalRedeemed: number;
  }> {
    const all = await this.giftCardsRepository.find();

    const stats = {
      total: all.length,
      active: all.filter((gc) => gc.status === GiftCardStatus.ACTIVE).length,
      redeemed: all.filter((gc) => gc.status === GiftCardStatus.REDEEMED)
        .length,
      expired: all.filter((gc) => gc.status === GiftCardStatus.EXPIRED).length,
      totalAmount: all.reduce((sum, gc) => sum + Number(gc.amount), 0),
      totalRedeemed: all
        .filter((gc) => gc.status === GiftCardStatus.REDEEMED)
        .reduce((sum, gc) => sum + Number(gc.amount), 0),
    };

    return stats;
  }
}
