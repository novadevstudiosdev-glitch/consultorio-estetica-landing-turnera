import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
  ParseUUIDPipe,
  Req,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Request } from 'express';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-preference')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear preferencia de pago para un turno',
    description:
      'Genera un link de pago de Mercado Pago para la seña del turno',
  })
  @ApiResponse({
    status: 201,
    description: 'Preferencia creada exitosamente',
    schema: {
      type: 'object',
      properties: {
        preferenceId: { type: 'string' },
        initPoint: { type: 'string', description: 'URL de pago (producción)' },
        sandboxInitPoint: {
          type: 'string',
          description: 'URL de pago (testing)',
        },
      },
    },
  })
  async createPreference(
    @Body()
    body: {
      appointmentId: string;
      amount: number;
      description: string;
      payer: {
        email: string;
        name: string;
      };
    },
  ) {
    return await this.paymentsService.createPaymentPreference(body);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook de Mercado Pago (público)',
    description:
      'Mercado Pago envía notificaciones aquí cuando cambia el estado del pago',
  })
  @ApiResponse({ status: 200, description: 'Webhook procesado' })
  async webhook(@Req() req: Request, @Body() body?: any) {
    // Mercado Pago a veces envía el body como query params
    const webhookData = body || req.query || req.body;

    this.logger.log(`📨 Webhook raw: ${JSON.stringify(webhookData)}`);
    this.logger.log(`📨 Query params: ${JSON.stringify(req.query)}`);
    this.logger.log(`📨 Headers: ${JSON.stringify(req.headers)}`);

    // Validar que tengamos datos
    if (!webhookData || Object.keys(webhookData).length === 0) {
      this.logger.warn('⚠️ Webhook sin datos');
      return { status: 'ok', message: 'No data received' };
    }

    await this.paymentsService.processWebhook(webhookData);
    return { status: 'ok' };
  }

  @Post('refund/:appointmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reembolsar pago de turno (solo admin)',
  })
  @ApiResponse({ status: 200, description: 'Reembolso procesado' })
  async refund(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() body: { reason?: string },
  ) {
    await this.paymentsService.refundPayment(appointmentId, body.reason);
    return {
      message: 'Reembolso procesado exitosamente',
      appointmentId,
    };
  }
}
