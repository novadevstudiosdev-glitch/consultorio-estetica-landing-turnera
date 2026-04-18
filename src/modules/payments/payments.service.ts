import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import type { PreferenceRequest } from 'mercadopago/dist/clients/preference/commonTypes';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
  PaymentMethod,
} from '../appointments/entities/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { GiftCardsService } from '../gift-cards/gift-cards.service';
import { GiftCardStatus } from '../gift-cards/entities/gift-card.entity';
import { User } from '../users/entities/user.entity';
import { WhatsappService } from '../../common/services/whatsapp.service';
import { EmailService } from '../../common/services/email.service';

interface CreatePaymentDto {
  appointmentId: string;
  amount: number;
  description: string;
  payer?: {
    email?: string;
    name?: string;
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly DEFAULT_PENDING_TTL_MINUTES = 15;
  private mercadopago: MercadoPagoConfig;
  private preference: Preference;

  constructor(
    private configService: ConfigService,
    private appointmentsService: AppointmentsService,
    private giftCardsService: GiftCardsService,
    private whatsappService: WhatsappService,
    private emailService: EmailService,
    private dataSource: DataSource,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
  ) {
    const accessToken = this.getAccessToken();

    if (!accessToken) {
      this.logger.warn(
        'MERCADOPAGO_ACCESS_TOKEN no configurado. Pagos deshabilitados.',
      );
      return;
    }

    try {
      this.mercadopago = new MercadoPagoConfig({
        accessToken,
        options: { timeout: 5000 },
      });
      this.preference = new Preference(this.mercadopago);
      this.logger.log('Mercado Pago inicializado correctamente');
    } catch (error) {
      this.logger.error('Error inicializando Mercado Pago', error);
    }
  }

  private getAccessToken(): string | undefined {
    return (
      this.configService.get<string>('MERCADOPAGO_ACCESS_TOKEN') ??
      this.configService.get<string>('MP_ACCESS_TOKEN')
    );
  }

  private isTestAccessToken(accessToken?: string): boolean {
    return /^TEST-/i.test(accessToken ?? '');
  }

  private isTestPayerEmail(email?: string): boolean {
    return /@testuser\.com$/i.test(email ?? '');
  }

  private getConfiguredTestPayerEmail(): string | undefined {
    return this.configService.get<string>('MP_TEST_PAYER_EMAIL')?.trim();
  }

  private shouldPreferAccountMoney(): boolean {
    const raw = this.configService
      .get<string>('MP_PREFER_ACCOUNT_MONEY')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return !['0', 'false', 'no', 'off'].includes(raw);
  }

  private normalizeEmail(email?: string): string | undefined {
    const normalized = email?.trim().toLowerCase();
    return normalized || undefined;
  }

  private normalizeBaseUrl(url?: string): string | undefined {
    if (!url) {
      return undefined;
    }

    const normalized = url.replace(/\/+$/, '');

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    const protocol = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)
      ? 'http'
      : 'https';

    return `${protocol}://${normalized}`;
  }

  private isHttpsUrl(url?: string): boolean {
    return !!url && /^https:\/\//i.test(url);
  }

  private getStatementDescriptor(): string | undefined {
    const rawDescriptor =
      this.configService.get<string>('MP_STATEMENT_DESCRIPTOR') ?? 'TURNERA';

    const normalized = rawDescriptor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .trim()
      .slice(0, 13);

    return normalized || undefined;
  }

  private getPendingTtlMinutes(): number {
    const raw =
      this.configService.get<string>('PENDING_APPOINTMENT_TTL_MINUTES') ??
      PaymentsService.DEFAULT_PENDING_TTL_MINUTES.toString();
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return PaymentsService.DEFAULT_PENDING_TTL_MINUTES;
    }

    return Math.floor(parsed);
  }

  private getMercadoPagoErrorDetails(error: unknown): string {
    const mpError = error as any;
    const apiResponse = mpError?.api_response;
    const apiData = apiResponse?.data;
    const apiCause = Array.isArray(apiData?.cause)
      ? apiData.cause
          .map((cause: any) => cause?.description || cause?.code)
          .filter(Boolean)
          .join('; ')
      : undefined;
    const sdkCause = Array.isArray(mpError?.cause)
      ? mpError.cause
          .map((cause: any) => cause?.description || cause?.code || cause)
          .filter(Boolean)
          .join('; ')
      : undefined;

    return [
      apiData?.message,
      apiData?.error,
      apiCause,
      mpError?.message,
      sdkCause,
      apiResponse?.status ? `HTTP ${apiResponse.status}` : undefined,
    ]
      .filter(Boolean)
      .join(' - ');
  }

  private didTransitionToConfirmed(
    previousStatus: AppointmentStatus,
    nextStatus: AppointmentStatus,
  ): boolean {
    return (
      previousStatus === AppointmentStatus.PENDING &&
      nextStatus === AppointmentStatus.CONFIRMED
    );
  }

  private formatAppointmentDate(date: string | Date): string {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }

    const raw = String(date ?? '').trim();
    return raw.length > 0 ? raw : 'Sin fecha';
  }

  async createPaymentPreference(
    createPaymentDto: CreatePaymentDto,
    user?: Pick<User, 'email' | 'fullName'>,
  ): Promise<{
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
    checkoutUrl: string;
  }> {
    if (!this.preference) {
      throw new BadRequestException('Mercado Pago no esta configurado');
    }

    const accessToken = this.getAccessToken();
    const appointment = await this.appointmentsService.findOne(
      createPaymentDto.appointmentId,
    );
    const depositAmount = Number(appointment.service?.depositAmount ?? 0);
    const paymentDescription = appointment.service?.name
      ? `Reserva de ${appointment.service.name}`
      : 'Reserva de turno';

    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      throw new BadRequestException(
        'El turno no tiene una sena valida para cobrar',
      );
    }

    try {
      const successUrl =
        this.configService.get<string>('MP_SUCCESS_URL') ??
        `${this.configService.get('FRONTEND_URL')}/payments/success.html`;
      const failureUrl =
        this.configService.get<string>('MP_FAILURE_URL') ??
        `${this.configService.get('FRONTEND_URL')}/payments/failure.html`;
      const pendingUrl =
        this.configService.get<string>('MP_PENDING_URL') ??
        `${this.configService.get('FRONTEND_URL')}/payments/pending.html`;
      const notificationUrl = `${this.normalizeBaseUrl(this.configService.get('BACKEND_URL'))}/${this.configService.get('API_PREFIX') || 'api'}/payments/webhook`;
      const hasHttpsBackUrls =
        this.isHttpsUrl(successUrl) &&
        this.isHttpsUrl(failureUrl) &&
        this.isHttpsUrl(pendingUrl);
      const hasHttpsNotificationUrl = this.isHttpsUrl(notificationUrl);
      const statementDescriptor = this.getStatementDescriptor();
      const preferenceData: PreferenceRequest = {
        items: [
          {
            id: appointment.id,
            title: paymentDescription,
            quantity: 1,
            unit_price: depositAmount,
            currency_id: 'ARS',
          },
        ],
        external_reference: appointment.id,
        metadata: {
          type: 'appointment',
          appointment_id: appointment.id,
          patient_name: appointment.patientName,
        },
      };

      if (this.shouldPreferAccountMoney()) {
        preferenceData.payment_methods = {
          default_payment_method_id: 'account_money',
        };
      }

      const requestedPayerEmail = this.normalizeEmail(
        createPaymentDto.payer?.email,
      );
      const authenticatedPayerEmail = this.normalizeEmail(user?.email);
      const configuredTestPayerEmail = this.normalizeEmail(
        this.getConfiguredTestPayerEmail(),
      );
      const payerEmailCandidate =
        authenticatedPayerEmail ?? requestedPayerEmail;
      const payerName =
        createPaymentDto.payer?.name?.trim() ||
        user?.fullName?.trim() ||
        appointment.patientName;

      if (
        authenticatedPayerEmail &&
        requestedPayerEmail &&
        authenticatedPayerEmail !== requestedPayerEmail
      ) {
        this.logger.warn(
          `Se ignora payer.email del body (${requestedPayerEmail}) para el turno ${appointment.id} y se usa el email autenticado (${authenticatedPayerEmail}).`,
        );
      }

      const payerEmail = this.isTestAccessToken(accessToken)
        ? this.isTestPayerEmail(payerEmailCandidate)
          ? payerEmailCandidate
          : configuredTestPayerEmail
        : payerEmailCandidate;

      if (payerEmail) {
        preferenceData.payer = {
          name: payerName,
          email: payerEmail,
        };
      } else {
        this.logger.warn(
          `No se pudo resolver un payer.email valido para el turno ${appointment.id}. Se omite payer para evitar errores de checkout.`,
        );
      }

      if (hasHttpsBackUrls) {
        preferenceData.back_urls = {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        };
        preferenceData.auto_return = 'approved';
      } else {
        this.logger.warn(
          'Mercado Pago requiere back_urls HTTPS. Se omiten en este entorno.',
        );
      }

      if (hasHttpsNotificationUrl) {
        preferenceData.notification_url = notificationUrl;
      } else {
        this.logger.warn(
          'Mercado Pago requiere notification_url HTTPS. Se omite en este entorno.',
        );
      }

      if (statementDescriptor) {
        preferenceData.statement_descriptor = statementDescriptor;
      }

      const now = new Date();
      const expirationDateTo = new Date(
        now.getTime() + this.getPendingTtlMinutes() * 60 * 1000,
      );
      preferenceData.expires = true;
      preferenceData.expiration_date_from = now.toISOString();
      preferenceData.expiration_date_to = expirationDateTo.toISOString();

      this.logger.log(
        `Creando preferencia MP: ${JSON.stringify({
          appointmentId: appointment.id,
          depositAmount,
          paymentDescription,
          payerEmail: preferenceData.payer?.email ?? null,
          defaultPaymentMethodId:
            preferenceData.payment_methods?.default_payment_method_id ?? null,
          successUrl,
          failureUrl,
          pendingUrl,
          notificationUrl: hasHttpsNotificationUrl ? notificationUrl : null,
          isTestMode: this.isTestAccessToken(accessToken),
        })}`,
      );
      this.logger.log(
        `[WA-DIAG][payments.preference] appointmentId=${appointment.id} hasHttpsBackUrls=${hasHttpsBackUrls} hasHttpsNotificationUrl=${hasHttpsNotificationUrl} notificationUrl=${hasHttpsNotificationUrl ? notificationUrl : 'omitted'}`,
      );

      const response = await this.preference.create({ body: preferenceData });
      const isTestMode = this.isTestAccessToken(accessToken);
      const checkoutUrl = isTestMode
        ? (response.sandbox_init_point ?? response.init_point)
        : (response.init_point ?? response.sandbox_init_point);

      if (!response.id || !checkoutUrl) {
        this.logger.error(
          `Mercado Pago devolvio una preferencia incompleta: ${JSON.stringify({
            id: response.id,
            initPoint: response.init_point,
            sandboxInitPoint: response.sandbox_init_point,
          })}`,
        );
        throw new BadRequestException(
          'Mercado Pago devolvio una preferencia sin URL de checkout',
        );
      }

      this.logger.log(
        `Preferencia MP creada: ${JSON.stringify({
          appointmentId: appointment.id,
          preferenceId: response.id,
          initPoint: response.init_point,
          sandboxInitPoint: response.sandbox_init_point,
          checkoutUrl,
        })}`,
      );

      return {
        preferenceId: response.id,
        initPoint: response.init_point ?? '',
        sandboxInitPoint: response.sandbox_init_point ?? '',
        checkoutUrl,
      };
    } catch (error) {
      const details = this.getMercadoPagoErrorDetails(error);

      this.logger.error(
        `Error creando preferencia de pago para turno ${appointment.id}: ${details || 'sin detalle'}`,
      );

      throw new BadRequestException(
        details
          ? `Error al crear preferencia de pago: ${details}`
          : 'Error al crear preferencia de pago',
      );
    }
  }

  private parsePaymentId(rawValue: unknown): number | null {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.floor(parsed);
  }

  private parsePaymentIdFromResource(resource?: unknown): number | null {
    if (typeof resource !== 'string' || resource.trim() === '') {
      return null;
    }

    const match = resource.match(/\/payments\/(\d+)(?:\D|$)/i);
    if (!match?.[1]) {
      return null;
    }

    return this.parsePaymentId(match[1]);
  }

  private resolveWebhookPaymentData(
    body?: unknown,
    query?: Record<string, unknown>,
  ): {
    type?: string;
    paymentId?: number;
    payload: Record<string, unknown>;
  } {
    const bodyRecord =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const queryRecord = query ?? {};

    const bodyData =
      bodyRecord.data && typeof bodyRecord.data === 'object'
        ? (bodyRecord.data as Record<string, unknown>)
        : undefined;

    const rawTypeCandidate =
      bodyRecord.type ??
      bodyRecord.topic ??
      bodyRecord.action ??
      queryRecord.type ??
      queryRecord.topic ??
      queryRecord.action;

    let normalizedType: string | undefined;
    if (
      typeof rawTypeCandidate === 'string' &&
      rawTypeCandidate.trim() !== ''
    ) {
      const typeValue = rawTypeCandidate.trim().toLowerCase();
      normalizedType = typeValue.startsWith('payment') ? 'payment' : typeValue;
    }

    const paymentIdCandidates: unknown[] = [
      bodyData?.id,
      bodyRecord['data.id'],
      bodyRecord.id,
      queryRecord['data.id'],
      queryRecord.id,
      this.parsePaymentIdFromResource(bodyRecord.resource),
      this.parsePaymentIdFromResource(queryRecord.resource),
    ];

    let paymentId: number | undefined;
    for (const candidate of paymentIdCandidates) {
      const parsed = this.parsePaymentId(candidate);
      if (parsed) {
        paymentId = parsed;
        break;
      }
    }

    return {
      type: normalizedType,
      paymentId,
      payload: {
        body: bodyRecord,
        query: queryRecord,
      },
    };
  }

  private async syncAppointmentWithPaymentInfo(
    paymentId: number,
    paymentInfo: any,
    source: 'webhook' | 'reconcile',
  ): Promise<boolean> {
    const appointmentId = String(paymentInfo?.external_reference ?? '').trim();

    if (!appointmentId) {
      this.logger.warn(
        `Pago ${paymentId} sin external_reference. Origen: ${source}.`,
      );
      return false;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let appointment: Appointment | null = null;
    let previousStatus: AppointmentStatus | null = null;

    try {
      appointment = await queryRunner.manager
        .getRepository(Appointment)
        .createQueryBuilder('appointment')
        .where('appointment.id = :appointmentId', { appointmentId })
        .setLock('pessimistic_write')
        .getOne();

      if (!appointment) {
        this.logger.warn(
          `No se encontro turno para external_reference ${appointmentId}. Origen: ${source}.`,
        );
        return false;
      }

      previousStatus = appointment.status;
      this.logger.log(
        `[WA-DIAG][payments.sync] source=${source} appointmentId=${appointmentId} paymentId=${paymentId} previousStatus=${previousStatus} paymentStatusFromMP=${String(paymentInfo?.status ?? '')}`,
      );

      if (
        paymentInfo.status === 'approved' &&
        appointment.status === AppointmentStatus.CANCELLED
      ) {
        this.logger.warn(
          `Pago aprobado para turno cancelado ${appointmentId}. Se mantiene cancelado para revision manual.`,
        );
        return false;
      }

      switch (paymentInfo.status) {
        case 'approved':
          appointment.status = AppointmentStatus.CONFIRMED;
          appointment.paymentStatus = PaymentStatus.PAID;
          appointment.paymentMethod = PaymentMethod.MP;
          appointment.paymentId = paymentId.toString();
          appointment.depositPaid = Number(paymentInfo.transaction_amount ?? 0);
          this.logger.log(`Pago aprobado para turno ${appointmentId}`);
          break;

        case 'pending':
        case 'in_process':
          appointment.paymentStatus = PaymentStatus.PENDING;
          this.logger.log(`Pago pendiente para turno ${appointmentId}`);
          break;

        case 'rejected':
        case 'cancelled':
          appointment.paymentStatus = PaymentStatus.PENDING;
          this.logger.log(`Pago rechazado para turno ${appointmentId}`);
          break;

        case 'refunded':
          appointment.paymentStatus = PaymentStatus.REFUNDED;
          this.logger.log(`Pago reembolsado para turno ${appointmentId}`);
          break;

        default:
          this.logger.warn(
            `Estado de pago no manejado para turno ${appointmentId}: ${paymentInfo.status}`,
          );
          return false;
      }

      await queryRunner.manager.getRepository(Appointment).save(appointment);
      await queryRunner.commitTransaction();

      const transitionedToConfirmed = this.didTransitionToConfirmed(
        previousStatus,
        appointment.status,
      );
      this.logger.log(
        `[WA-DIAG][payments.sync] source=${source} appointmentId=${appointmentId} previousStatus=${previousStatus} nextStatus=${appointment.status} transitionedToConfirmed=${transitionedToConfirmed}`,
      );

      if (transitionedToConfirmed) {
        try {
          this.logger.log(
            `[WA-DIAG][payments.sync] attempting sendAppointmentCreated appointmentId=${appointmentId} patientPhone="${appointment.patientPhone ?? ''}" doctorPhoneFallback="${this.configService.get<string>('DOCTOR_PHONE') ?? this.configService.get<string>('TWILIO_WHATSAPP_TO') ?? ''}"`,
          );
          await this.whatsappService.sendAppointmentCreated({
            appointmentId,
            patientName: appointment.patientName,
            patientPhone: appointment.patientPhone,
            serviceName: appointment.service?.name ?? 'Turno',
            date: this.formatAppointmentDate(appointment.appointmentDate),
            time: appointment.appointmentTime,
          });
        } catch (error) {
          this.logger.error(
            `Error enviando WhatsApp de confirmacion para turno ${appointmentId}`,
            error,
          );
        }

        try {
          const appointmentWithService =
            await this.appointmentsRepository.findOne({
              where: { id: appointmentId },
              relations: ['service'],
            });

          if (!appointmentWithService) {
            this.logger.warn(
              `No se encontro turno confirmado para enviar email: ${appointmentId}`,
            );
          } else if (appointmentWithService.confirmationSent) {
            this.logger.log(
              `[payments.sync] confirmation email ya enviado para turno ${appointmentId}`,
            );
          } else {
            const confirmationSent =
              await this.emailService.sendAppointmentConfirmation(
              appointmentWithService.patientEmail,
              {
                patientName: appointmentWithService.patientName,
                serviceName:
                  appointmentWithService.service?.name ?? 'Turno',
                date: appointmentWithService.appointmentDate.toString(),
                time: appointmentWithService.appointmentTime,
                depositAmount:
                  appointmentWithService.service?.depositAmount ?? undefined,
              },
              );
            if (confirmationSent) {
              appointmentWithService.confirmationSent = true;
              await this.appointmentsRepository.save(appointmentWithService);
            }
          }
        } catch (error) {
          this.logger.error(
            `Error enviando email de confirmacion para turno ${appointmentId}`,
            error as Error,
          );
        }

        // Notificar a la doctora solo si el turno fue creado por un paciente (no admin)
        if (!appointment.createdByAdmin) {
          try {
            await this.emailService.sendDoctorNewAppointmentNotification({
              patientName: appointment.patientName,
              patientEmail: appointment.patientEmail,
              patientPhone: appointment.patientPhone,
              serviceName: appointment.service?.name ?? 'Turno',
              date: this.formatAppointmentDate(appointment.appointmentDate),
              time: appointment.appointmentTime,
              depositAmount: appointment.depositPaid ?? appointment.service?.depositAmount,
            });
          } catch (error) {
            this.logger.error(
              `Error enviando notificación de nuevo turno a la doctora para turno ${appointmentId}`,
              error,
            );
          }
        }
      } else {
        this.logger.log(
          `[WA-DIAG][payments.sync] skipping sendAppointmentCreated appointmentId=${appointmentId} because transition condition is false`,
        );
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error sincronizando pago ${paymentId} para turno ${appointmentId}. Origen: ${source}.`,
        error as Error,
      );
      return false;
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcilePendingPaymentsCron(): Promise<void> {
    try {
      this.logger.log('[WA-DIAG][payments.reconcile.cron] tick');
      await this.reconcilePendingApprovedPayments();
    } catch (error) {
      this.logger.error('Error en reconciliacion de pagos pendientes', error);
    }
  }

  private async reconcilePendingApprovedPayments(): Promise<number> {
    if (!this.getAccessToken()) {
      return 0;
    }

    const pendingAppointments = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .where('appointment.status = :status', {
        status: AppointmentStatus.PENDING,
      })
      .andWhere('appointment.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PENDING,
      })
      .orderBy('appointment.createdAt', 'DESC')
      .take(20)
      .getMany();
    this.logger.log(
      `[WA-DIAG][payments.reconcile] pendingAppointments=${pendingAppointments.length}`,
    );

    if (pendingAppointments.length === 0) {
      return 0;
    }

    let syncedCount = 0;

    for (const appointment of pendingAppointments) {
      const paymentInfo = await this.getLatestPaymentByExternalReference(
        appointment.id,
      );

      if (!paymentInfo) {
        continue;
      }

      const paymentId = this.parsePaymentId(paymentInfo.id);
      if (!paymentId) {
        continue;
      }

      const updated = await this.syncAppointmentWithPaymentInfo(
        paymentId,
        paymentInfo,
        'reconcile',
      );

      if (updated) {
        syncedCount += 1;
      }
    }

    if (syncedCount > 0) {
      this.logger.log(
        `Reconciliacion de pagos completada. Turnos sincronizados: ${syncedCount}`,
      );
    }

    return syncedCount;
  }

  // Crear preferencia para gift card
  async createGiftCardPaymentPreference(giftCardId: string): Promise<{
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
    checkoutUrl: string;
  }> {
    if (!this.preference) {
      throw new BadRequestException('Mercado Pago no está configurado');
    }

    const giftCard = await this.giftCardsService.findOne(giftCardId);

    if (giftCard.status !== GiftCardStatus.PENDING) {
      throw new BadRequestException('Esta gift card ya fue procesada');
    }

    try {
      const successUrl =
        this.configService.get<string>('MP_SUCCESS_URL') ??
        `${this.configService.get('FRONTEND_URL')}/payments/success.html`;
      const failureUrl =
        this.configService.get<string>('MP_FAILURE_URL') ??
        `${this.configService.get('FRONTEND_URL')}/payments/failure.html`;
      const pendingUrl =
        this.configService.get<string>('MP_PENDING_URL') ??
        `${this.configService.get('FRONTEND_URL')}/payments/pending.html`;
      const notificationUrl = `${this.normalizeBaseUrl(this.configService.get('BACKEND_URL'))}/${this.configService.get('API_PREFIX') || 'api'}/payments/webhook`;

      const hasHttpsBackUrls =
        this.isHttpsUrl(successUrl) &&
        this.isHttpsUrl(failureUrl) &&
        this.isHttpsUrl(pendingUrl);
      const hasHttpsNotificationUrl = this.isHttpsUrl(notificationUrl);
      const statementDescriptor = this.getStatementDescriptor();
      const accessToken = this.getAccessToken();
      const unitPrice = Number(giftCard.amount);

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new BadRequestException('Monto de gift card invalido');
      }

      const preferenceData: PreferenceRequest = {
        items: [
          {
            id: giftCard.id,
            title: `Gift Card - $${giftCard.amount}`,
            quantity: 1,
            unit_price: unitPrice,
            currency_id: 'ARS',
          },
        ],
        payer: {
          name: giftCard.purchaserName,
          email: giftCard.purchaserEmail,
        },
        external_reference: giftCard.id,
        metadata: {
          type: 'gift_card',
          gift_card_id: giftCard.id,
          code: giftCard.code,
          recipient_name: giftCard.recipientName,
          recipient_email: giftCard.recipientEmail,
        },
      };

      if (hasHttpsBackUrls) {
        preferenceData.back_urls = {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        };
        preferenceData.auto_return = 'approved';
      } else {
        this.logger.warn(
          'Mercado Pago requiere back_urls HTTPS. Se omiten para testing local.',
        );
      }

      if (hasHttpsNotificationUrl) {
        preferenceData.notification_url = notificationUrl;
      } else {
        this.logger.warn(
          'Mercado Pago requiere notification_url HTTPS. Se omite para testing local.',
        );
      }

      if (statementDescriptor) {
        preferenceData.statement_descriptor = statementDescriptor;
      }

      const response = await this.preference.create({ body: preferenceData });
      const isTestMode = this.isTestAccessToken(accessToken);
      const checkoutUrl = isTestMode
        ? (response.sandbox_init_point ?? response.init_point)
        : (response.init_point ?? response.sandbox_init_point);

      this.logger.log(
        `💰 Preferencia MP creada para Gift Card ${giftCard.code}: ${response.id}`,
      );

      return {
        preferenceId: response.id!,
        initPoint: response.init_point ?? '',
        sandboxInitPoint: response.sandbox_init_point ?? '',
        checkoutUrl: checkoutUrl!,
      };
    } catch (error) {
      const details = this.getMercadoPagoErrorDetails(error);

      this.logger.error(
        `Error creando preferencia de pago para gift card:`,
        error,
      );

      throw new BadRequestException(
        details
          ? `Error al crear preferencia de pago: ${details}`
          : 'Error al crear preferencia de pago',
      );
    }
  }

  async processWebhook(
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<void> {
    const { type, paymentId, payload } = this.resolveWebhookPaymentData(
      body,
      query,
    );
    this.logger.log(
      `[WA-DIAG][payments.webhook] resolvedType=${type ?? 'n/a'} paymentId=${paymentId ?? 'n/a'} payload=${JSON.stringify(payload)}`,
    );
    this.logger.log(`Webhook recibido: ${JSON.stringify(payload)}`);

    if (type && type !== 'payment') {
      this.logger.log(
        `[WA-DIAG][payments.webhook] ignoredType=${type ?? 'unknown'} paymentId=${paymentId ?? 'n/a'}`,
      );
      this.logger.log(`Webhook ignorado para tipo ${type ?? 'desconocido'}`);
      return;
    }

    if (!paymentId) {
      this.logger.warn(
        `[WA-DIAG][payments.webhook] missingPaymentId payload=${JSON.stringify(payload)}`,
      );
      throw new BadRequestException('Webhook de pago sin id valido');
    }

    const paymentInfo = await this.getPaymentInfo(paymentId);
    this.logger.log(
      `[WA-DIAG][payments.webhook] paymentId=${paymentId} paymentStatusFromMP=${String(paymentInfo?.status ?? '')} externalReference=${String(paymentInfo?.external_reference ?? '')}`,
    );

    if (!paymentInfo) {
      throw new BadRequestException(
        `No se pudo obtener info del pago ${paymentId}`,
      );
    }

    const referenceId = paymentInfo.external_reference;
    const metadata = paymentInfo.metadata;

    if (!referenceId) {
      throw new BadRequestException('Webhook sin external_reference');
    }

    // Determinar si es appointment o gift card
    const isGiftCard = metadata?.type === 'gift_card';

    if (isGiftCard) {
      // 🎁 Procesar pago de gift card
      await this.processGiftCardPayment(referenceId, paymentId, paymentInfo);
    } else {
      // 📅 Procesar pago de appointment
      await this.syncAppointmentWithPaymentInfo(
        paymentId,
        paymentInfo,
        'webhook',
      );
    }
  }

  // Procesar pago de gift card
  private async processGiftCardPayment(
    giftCardId: string,
    paymentId: number,
    paymentInfo: any,
  ): Promise<void> {
    await this.giftCardsService.activate(
      giftCardId,
      paymentId.toString(),
      paymentInfo.status,
    );

    this.logger.log(
      `🎁 Gift Card procesada: ${giftCardId} - Status: ${paymentInfo.status}`,
    );
  }

  private async getPaymentInfo(paymentId: number): Promise<any> {
    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.getAccessToken()}`,
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status} al consultar pago ${paymentId}: ${errorBody}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error obteniendo info de pago', error);
      return null;
    }
  }

  private async getLatestPaymentByExternalReference(
    appointmentId: string,
  ): Promise<any | null> {
    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(appointmentId)}&sort=date_created&criteria=desc&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${this.getAccessToken()}`,
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status} al buscar pago por referencia ${appointmentId}: ${errorBody}`,
        );
      }

      const payload = await response.json();
      const firstResult = Array.isArray(payload?.results)
        ? payload.results[0]
        : null;

      return firstResult ?? null;
    } catch (error) {
      this.logger.error(
        `Error buscando pago por external_reference ${appointmentId}`,
        error,
      );
      return null;
    }
  }

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
            Authorization: `Bearer ${this.getAccessToken()}`,
          },
          body: JSON.stringify({
            amount: appointment.depositPaid,
            metadata: { reason },
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status} al reembolsar pago ${appointment.paymentId}: ${errorBody}`,
        );
      }

      appointment.paymentStatus = PaymentStatus.REFUNDED;
      await this.appointmentsRepository.save(appointment);

      this.logger.log(`💸 Reembolso procesado para turno ${appointmentId}`);
    } catch (error) {
      this.logger.error('Error procesando reembolso', error);
      throw new BadRequestException('Error al procesar reembolso');
    }
  }
}

