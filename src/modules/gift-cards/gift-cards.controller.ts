import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { GiftCardsService } from './gift-cards.service';
import {
  PurchaseGiftCardDto,
  RedeemGiftCardDto,
  ValidateGiftCardDto,
  UpdateGiftCardDto,
} from './dto/gift-card.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { GiftCardStatus } from './entities/gift-card.entity';

@ApiTags('Gift Cards')
@Controller('gift-cards')
export class GiftCardsController {
  constructor(private readonly giftCardsService: GiftCardsService) {}

  @Post('purchase')
  @Public()
  @ApiOperation({
    summary: 'Iniciar compra de gift card (público)',
    description:
      'Crea una gift card pendiente. Luego se debe crear la preferencia de pago.',
  })
  @ApiResponse({ status: 201, description: 'Gift card creada (pendiente de pago)' })
  async purchase(@Body() purchaseDto: PurchaseGiftCardDto) {
    return await this.giftCardsService.create(purchaseDto);
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar código de gift card (solo admin)',
    description: 'Verifica si un código es válido y muestra el saldo disponible',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado de la validación',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        message: { type: 'string' },
        giftCard: { type: 'object' },
      },
    },
  })
  async validate(@Body() validateDto: ValidateGiftCardDto) {
    return await this.giftCardsService.validate(validateDto.code);
  }

  @Post(':code/redeem')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Canjear gift card total o parcialmente (solo admin)',
    description: 'Descuenta el monto canjeado del saldo de la gift card',
  })
  @ApiResponse({ status: 200, description: 'Gift card canjeada exitosamente' })
  async redeem(
    @Param('code') code: string,
    @Body() redeemDto: RedeemGiftCardDto,
    @CurrentUser() admin: User,
  ) {
    return await this.giftCardsService.redeem(code, redeemDto, admin.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar gift cards (solo admin)' })
  @ApiQuery({ name: 'status', required: false, enum: GiftCardStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de gift cards' })
  async findAll(
    @Query('status') status?: GiftCardStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = limit ? Math.max(1, parseInt(limit, 10)) : 20;

    return await this.giftCardsService.findAll(status, pageNum, limitNum);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estadísticas de gift cards (solo admin)' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        active: { type: 'number' },
        redeemed: { type: 'number' },
        expired: { type: 'number' },
        totalAmount: { type: 'number' },
        totalRedeemed: { type: 'number' },
      },
    },
  })
  async getStats() {
    return await this.giftCardsService.getStats();
  }

  @Get(':code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener gift card por código (solo admin)' })
  @ApiResponse({ status: 200, description: 'Gift card encontrada' })
  @ApiResponse({ status: 404, description: 'Gift card no encontrada' })
  async findOne(@Param('code') code: string) {
    return await this.giftCardsService.findByCode(code);
  }

  @Patch(':code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar gift card (solo admin)' })
  @ApiResponse({ status: 200, description: 'Gift card actualizada' })
  async update(
    @Param('code') code: string,
    @Body() updateDto: UpdateGiftCardDto,
  ) {
    return await this.giftCardsService.update(code, updateDto);
  }

  @Post(':code/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar gift card (solo admin)' })
  @ApiResponse({ status: 200, description: 'Gift card cancelada' })
  async cancel(
    @Param('code') code: string,
    @Body() body: { reason: string },
  ) {
    return await this.giftCardsService.cancel(code, body.reason);
  }
}
