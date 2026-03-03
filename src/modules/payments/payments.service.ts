// PRIMERO: Instalar SDK de Mercado Pago
// npm install mercadopago

// src/modules/payments/payments.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import {
  Appointment,
  PaymentStatus,
  PaymentMethod,
} from '../appointments/entities/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';

interface CreatePaymentDto {
  appointmentId: string;
  amount: number;
  description: string;
  payer: {
    email: string;
    name: string;
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private mercadopago: MercadoPagoConfig;
  private preference: Preference;

  constructor(
    private configService: ConfigService,
    private appointmentsService: AppointmentsService,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
  ) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );

    if (!accessToken) {
      this.logger.warn(
        '⚠️ MERCADOPAGO_ACCESS_TOKEN no configurado. Pagos deshabilitados.',
      );
      return;
    }

    try {
      this.mercadopago = new MercadoPagoConfig({
        accessToken,
        options: { timeout: 5000 },
      });
      this.preference = new Preference(this.mercadopago);
      this.logger.log('✅ Mercado Pago inicializado correctamente');
    } catch (error) {
      this.logger.error('❌ Error inicializando Mercado Pago:', error);
    }
  }

  /**
   * Crear preferencia de pago para un turno
   */
  async createPaymentPreference(createPaymentDto: CreatePaymentDto): Promise<{
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
  }> {
    if (!this.preference) {
      throw new BadRequestException('Mercado Pago no está configurado');
    }

    const appointment = await this.appointmentsService.findOne(
      createPaymentDto.appointmentId,
    );

    try {
      const preferenceData = {
        items: [
          {
            id: appointment.id,
            title: createPaymentDto.description,
            quantity: 1,
            unit_price: createPaymentDto.amount,
            currency_id: 'ARS',
          },
        ],
        payer: {
          name: createPaymentDto.payer.name,
          email: createPaymentDto.payer.email,
        },
        back_urls: {
          success: `${this.configService.get('FRONTEND_URL')}/payment/success`,
          failure: `${this.configService.get('FRONTEND_URL')}/payment/failure`,
          pending: `${this.configService.get('FRONTEND_URL')}/payment/pending`,
        },
        auto_return: 'approved' as const,
        notification_url: `${this.configService.get('BACKEND_URL')}/api/v1/payments/webhook`,
        external_reference: appointment.id, // Para identificar el turno en el webhook
        statement_descriptor: 'TURNERA MEDICA',
        metadata: {
          appointment_id: appointment.id,
          patient_name: appointment.patientName,
        },
      };

      const response = await this.preference.create({ body: preferenceData });

      this.logger.log(
        `💰 Preferencia creada para turno ${appointment.id}: ${response.id}`,
      );

      return {
        preferenceId: response.id!,
        initPoint: response.init_point!,
        sandboxInitPoint: response.sandbox_init_point!,
      };
    } catch (error) {
      this.logger.error('❌ Error creando preferencia de pago:', error);
      throw new BadRequestException('Error al crear preferencia de pago');
    }
  }

  /**
   * Procesar webhook de Mercado Pago
   */
  async processWebhook(body: any): Promise<void> {
    this.logger.log(`📨 Webhook recibido: ${JSON.stringify(body)}`);

    const { type, data } = body;

    if (type === 'payment') {
      const paymentId = data.id;

      try {
        // Obtener información del pago
        const paymentInfo = await this.getPaymentInfo(paymentId);

        if (!paymentInfo) {
          this.logger.warn(`⚠️ No se pudo obtener info del pago ${paymentId}`);
          return;
        }

        // Obtener el turno desde external_reference
        const appointmentId = paymentInfo.external_reference;

        if (!appointmentId) {
          this.logger.warn('⚠️ Webhook sin external_reference');
          return;
        }

        const appointment =
          await this.appointmentsService.findOne(appointmentId);

        // Actualizar estado según el status del pago
        switch (paymentInfo.status) {
          case 'approved':
            appointment.paymentStatus = PaymentStatus.PAID;
            appointment.paymentMethod = PaymentMethod.MP;
            appointment.paymentId = paymentId.toString();
            appointment.depositPaid = paymentInfo.transaction_amount;
            this.logger.log(`✅ Pago aprobado para turno ${appointmentId}`);
            break;

          case 'pending':
          case 'in_process':
            appointment.paymentStatus = PaymentStatus.PENDING;
            this.logger.log(`⏳ Pago pendiente para turno ${appointmentId}`);
            break;

          case 'rejected':
          case 'cancelled':
            appointment.paymentStatus = PaymentStatus.PENDING;
            this.logger.log(`❌ Pago rechazado para turno ${appointmentId}`);
            break;

          case 'refunded':
            appointment.paymentStatus = PaymentStatus.REFUNDED;
            this.logger.log(`💸 Pago reembolsado para turno ${appointmentId}`);
            break;
        }

        await this.appointmentsRepository.save(appointment);

        // TODO: Enviar email de confirmación si el pago fue aprobado
      } catch (error) {
        this.logger.error(
          `❌ Error procesando webhook para pago ${paymentId}:`,
          error,
        );
      }
    }
  }

  /**
   * Obtener información de un pago
   */
  private async getPaymentInfo(paymentId: number): Promise<any> {
    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.configService.get('MERCADOPAGO_ACCESS_TOKEN')}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error obteniendo info de pago:', error);
      return null;
    }
  }

  /**
   * Procesar reembolso
   */
  async refundPayment(appointmentId: string, reason?: string): Promise<void> {
    const appointment = await this.appointmentsService.findOne(appointmentId);

    if (!appointment.paymentId) {
      throw new BadRequestException('El turno no tiene un pago asociado');
    }

    if (appointment.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Solo se pueden reembolsar pagos aprobados',
      );
    }

    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${appointment.paymentId}/refunds`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.configService.get('MERCADOPAGO_ACCESS_TOKEN')}`,
          },
          body: JSON.stringify({
            amount: appointment.depositPaid,
            metadata: { reason },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      appointment.paymentStatus = PaymentStatus.REFUNDED;
      await this.appointmentsRepository.save(appointment);

      this.logger.log(`💸 Reembolso procesado para turno ${appointmentId}`);
    } catch (error) {
      this.logger.error('❌ Error procesando reembolso:', error);
      throw new BadRequestException('Error al procesar reembolso');
    }
  }
}
