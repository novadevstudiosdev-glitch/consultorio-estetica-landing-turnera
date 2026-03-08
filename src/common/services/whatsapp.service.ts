import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

interface AppointmentWhatsappPayload {
  appointmentId?: string;
  patientName: string;
  patientPhone?: string;
  serviceName: string;
  date: string;
  time: string;
  doctorPhone?: string;
  cancellationReason?: string;
}

interface DispatchResult {
  patientSent: boolean;
  doctorSent: boolean;
}

interface DeliveryStatusSnapshot {
  status: string;
  errorCode: number | null;
  errorMessage: string | null;
}

interface WhatsappDispatchContext {
  appointmentId?: string;
  event: 'created' | 'cancelled' | 'reminder_24h' | 'reminder_2h';
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly whatsappEnabled: boolean;
  private readonly fromNumber?: string;
  private readonly doctorPhone?: string;
  private readonly deliveryCheckTimeoutMs: number;
  private readonly deliveryCheckIntervalMs: number;
  private twilioClient: Twilio | null = null;

  constructor(private readonly configService: ConfigService) {
    const whatsappEnabled = this.parseBoolean(
      this.configService.get<string>('WHATSAPP_ENABLED'),
      false,
    );
    const notificationsWhatsappEnabled = this.parseBoolean(
      this.configService.get<string>('NOTIFICATIONS_WHATSAPP_ENABLED'),
      false,
    );

    this.whatsappEnabled = whatsappEnabled && notificationsWhatsappEnabled;
    this.fromNumber = this.normalizeWhatsappAddress(
      this.configService.get<string>('TWILIO_WHATSAPP_FROM'),
    );
    this.doctorPhone =
      this.configService.get<string>('DOCTOR_PHONE') ??
      this.configService.get<string>('TWILIO_WHATSAPP_TO');
    this.deliveryCheckTimeoutMs = this.parsePositiveInt(
      this.configService.get<string>('WHATSAPP_DELIVERY_CHECK_TIMEOUT_MS'),
      3000,
    );
    this.deliveryCheckIntervalMs = this.parsePositiveInt(
      this.configService.get<string>('WHATSAPP_DELIVERY_CHECK_INTERVAL_MS'),
      750,
    );
    this.logger.log(
      `[WA-DIAG][whatsapp.constructor] enabledFlags={WHATSAPP_ENABLED:${whatsappEnabled},NOTIFICATIONS_WHATSAPP_ENABLED:${notificationsWhatsappEnabled}} effectiveEnabled=${this.whatsappEnabled} hasFrom=${Boolean(this.fromNumber)} hasDoctorFallback=${Boolean(this.doctorPhone)} deliveryCheckTimeoutMs=${this.deliveryCheckTimeoutMs} deliveryCheckIntervalMs=${this.deliveryCheckIntervalMs}`,
    );

    if (!this.whatsappEnabled) {
      this.logger.warn(
        'WhatsApp notifications disabled (WHATSAPP_ENABLED and/or NOTIFICATIONS_WHATSAPP_ENABLED).',
      );
      return;
    }

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.logger.log(
      `[WA-DIAG][whatsapp.constructor] hasAccountSid=${Boolean(accountSid)} hasAuthToken=${Boolean(authToken)} from=${this.fromNumber ?? 'n/a'}`,
    );

    if (!accountSid || !authToken || !this.fromNumber) {
      this.logger.warn(
        'Twilio WhatsApp not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_WHATSAPP_FROM.',
      );
      return;
    }

    try {
      this.twilioClient = new Twilio(accountSid, authToken);
      this.logger.log('Twilio WhatsApp service initialized successfully');

      if (this.fromNumber === 'whatsapp:+14155238886') {
        this.logger.warn(
          'Twilio WhatsApp Sandbox detected. Recipients must join the sandbox (join code) every 3 days.',
        );
      }
    } catch (error) {
      this.logger.error('Error initializing Twilio WhatsApp service', error);
    }
  }

  async sendAppointmentCreated(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
    this.logger.log(
      `[WA-DIAG][whatsapp.sendAppointmentCreated] appointmentId=${payload.appointmentId ?? 'n/a'} patientPhoneRaw="${payload.patientPhone ?? ''}" doctorPhoneRaw="${payload.doctorPhone ?? this.doctorPhone ?? ''}"`,
    );
    const patientMessage =
      `Hola ${payload.patientName}, tu turno fue registrado.` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}`;

    const doctorMessage =
      `Nuevo turno registrado.` +
      `\nPaciente: ${payload.patientName}` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}`;

    return this.sendToPatientAndDoctor(
      payload.patientPhone,
      payload.doctorPhone,
      patientMessage,
      doctorMessage,
      {
        appointmentId: payload.appointmentId,
        event: 'created',
      },
    );
  }

  async sendAppointmentCancelled(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
    this.logger.log(
      `[WA-DIAG][whatsapp.sendAppointmentCancelled] appointmentId=${payload.appointmentId ?? 'n/a'} patientPhoneRaw="${payload.patientPhone ?? ''}" doctorPhoneRaw="${payload.doctorPhone ?? this.doctorPhone ?? ''}"`,
    );
    const reasonText = payload.cancellationReason?.trim()
      ? `\nMotivo: ${payload.cancellationReason.trim()}`
      : '';

    const patientMessage =
      `Hola ${payload.patientName}, tu turno fue cancelado.` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}` +
      reasonText;

    const doctorMessage =
      `Turno cancelado.` +
      `\nPaciente: ${payload.patientName}` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}` +
      reasonText;

    return this.sendToPatientAndDoctor(
      payload.patientPhone,
      payload.doctorPhone,
      patientMessage,
      doctorMessage,
      {
        appointmentId: payload.appointmentId,
        event: 'cancelled',
      },
    );
  }

  async send24HourReminder(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
    this.logger.log(
      `[WA-DIAG][whatsapp.send24HourReminder] appointmentId=${payload.appointmentId ?? 'n/a'} patientPhoneRaw="${payload.patientPhone ?? ''}" doctorPhoneRaw="${payload.doctorPhone ?? this.doctorPhone ?? ''}"`,
    );
    const patientMessage =
      `Hola ${payload.patientName}, recordatorio de turno (24h).` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}`;

    const doctorMessage =
      `Recordatorio 24h de turno.` +
      `\nPaciente: ${payload.patientName}` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}`;

    return this.sendToPatientAndDoctor(
      payload.patientPhone,
      payload.doctorPhone,
      patientMessage,
      doctorMessage,
      {
        appointmentId: payload.appointmentId,
        event: 'reminder_24h',
      },
    );
  }

  async send2HourReminder(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
    this.logger.log(
      `[WA-DIAG][whatsapp.send2HourReminder] appointmentId=${payload.appointmentId ?? 'n/a'} patientPhoneRaw="${payload.patientPhone ?? ''}" doctorPhoneRaw="${payload.doctorPhone ?? this.doctorPhone ?? ''}"`,
    );
    const patientMessage =
      `Hola ${payload.patientName}, recordatorio de turno (2h).` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}`;

    const doctorMessage =
      `Recordatorio 2h de turno.` +
      `\nPaciente: ${payload.patientName}` +
      `\nServicio: ${payload.serviceName}` +
      `\nFecha: ${payload.date}` +
      `\nHora: ${payload.time}`;

    return this.sendToPatientAndDoctor(
      payload.patientPhone,
      payload.doctorPhone,
      patientMessage,
      doctorMessage,
      {
        appointmentId: payload.appointmentId,
        event: 'reminder_2h',
      },
    );
  }

  private async sendToPatientAndDoctor(
    patientPhone: string | undefined,
    doctorPhone: string | undefined,
    patientMessage: string,
    doctorMessage: string,
    context: WhatsappDispatchContext,
  ): Promise<boolean> {
    this.logger.log(
      `[WA-DIAG][whatsapp.dispatch] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} patientPhoneRaw="${patientPhone ?? ''}" doctorPhoneRaw="${doctorPhone ?? this.doctorPhone ?? ''}"`,
    );
    const result = await Promise.all([
      this.sendMessage(patientPhone, patientMessage, 'patient', context),
      this.sendMessage(
        doctorPhone ?? this.doctorPhone,
        doctorMessage,
        'doctor',
        context,
      ),
    ]);

    const dispatchResult: DispatchResult = {
      patientSent: result[0],
      doctorSent: result[1],
    };

    return dispatchResult.patientSent || dispatchResult.doctorSent;
  }

  private async sendMessage(
    rawPhone: string | undefined,
    message: string,
    recipient: 'patient' | 'doctor',
    context: WhatsappDispatchContext,
  ): Promise<boolean> {
    if (!this.whatsappEnabled) {
      this.logger.warn(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} skipped=disabled_by_config`,
      );
      return false;
    }

    if (!this.twilioClient) {
      this.logger.warn(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} skipped=twilio_not_initialized`,
      );
      return false;
    }

    if (!this.fromNumber) {
      this.logger.warn(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} skipped=from_not_configured`,
      );
      return false;
    }

    const normalizedPhone = this.normalizePhone(rawPhone);
    if (!normalizedPhone) {
      this.logger.warn(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} skipped=phone_not_normalized rawPhone="${rawPhone ?? ''}"`,
      );
      return false;
    }

    const toAddress = this.normalizeWhatsappAddress(normalizedPhone);
    if (!toAddress) {
      this.logger.warn(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} skipped=to_address_invalid normalizedPhone="${normalizedPhone}"`,
      );
      return false;
    }

    try {
      this.logger.log(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} attemptingSend=true from=${this.fromNumber} to=${toAddress}`,
      );

      const createdMessage = await this.twilioClient.messages.create({
        body: message,
        from: this.fromNumber,
        to: toAddress,
      });
      this.logger.log(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} twilioMessageSid=${createdMessage.sid} createStatus=${String(createdMessage.status ?? 'queued')}`,
      );

      const deliverySnapshot = await this.waitForDeliveryStatus(createdMessage.sid);
      if (
        deliverySnapshot &&
        this.isDeliveryFailureStatus(deliverySnapshot.status)
      ) {
        const hint = this.getTwilioErrorHint(deliverySnapshot.errorCode);
        this.logger.error(
          `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} deliveryResult=failed sid=${createdMessage.sid} status=${deliverySnapshot.status} code=${deliverySnapshot.errorCode ?? 'unknown'} message="${deliverySnapshot.errorMessage ?? 'unknown'}"${hint ? ` hint="${hint}"` : ''}`,
        );
        return false;
      }

      if (deliverySnapshot) {
        this.logger.log(
          `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} deliveryResult=success sid=${createdMessage.sid} status=${deliverySnapshot.status}`,
        );
      } else {
        this.logger.log(
          `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} deliveryResult=queued sid=${createdMessage.sid} status=${createdMessage.status ?? 'queued'} finalStatusPending=true`,
        );
      }
      return true;
    } catch (error) {
      const twilioError = error as {
        code?: number;
        status?: number;
        message?: string;
        moreInfo?: string;
      };
      const hint = this.getTwilioErrorHint(twilioError?.code);

      this.logger.error(
        `[WA-DIAG][whatsapp.sendMessage] event=${context.event} appointmentId=${context.appointmentId ?? 'n/a'} recipient=${recipient} twilioRequestError=true code=${twilioError?.code ?? 'unknown'} status=${twilioError?.status ?? 'unknown'} message="${twilioError?.message ?? 'unknown'}" moreInfo=${twilioError?.moreInfo ?? 'n/a'}${hint ? ` hint="${hint}"` : ''}`,
      );
      return false;
    }
  }

  private async waitForDeliveryStatus(
    messageSid: string,
  ): Promise<DeliveryStatusSnapshot | null> {
    if (!this.twilioClient || !messageSid) {
      return null;
    }

    const deadline = Date.now() + this.deliveryCheckTimeoutMs;
    while (Date.now() <= deadline) {
      try {
        const snapshot = await this.twilioClient.messages(messageSid).fetch();
        const status = String(snapshot.status ?? '').toLowerCase();

        if (this.isFinalDeliveryStatus(status)) {
          return {
            status,
            errorCode: snapshot.errorCode ?? null,
            errorMessage: snapshot.errorMessage ?? null,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch Twilio delivery status for sid=${messageSid}.`,
          error as Error,
        );
        return null;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      await this.sleep(Math.min(this.deliveryCheckIntervalMs, remainingMs));
    }

    return null;
  }

  private isFinalDeliveryStatus(status: string): boolean {
    return [
      'accepted',
      'delivered',
      'failed',
      'read',
      'sent',
      'undelivered',
      'canceled',
    ].includes(status);
  }

  private isDeliveryFailureStatus(status: string): boolean {
    return ['failed', 'undelivered', 'canceled'].includes(status);
  }

  private getTwilioErrorHint(code?: number | null): string | null {
    switch (code) {
      case 63015:
        return 'Sandbox restriction: destination number must join sandbox again (join code expires every 3 days).';
      case 63016:
        return 'WhatsApp 24h session expired. Use an approved template or wait for a new inbound user message.';
      case 63018:
        return 'Destination number is not available on WhatsApp.';
      case 21608:
        return 'Trial account restriction: destination must be verified/sandbox-joined.';
      case 21211:
        return 'Destination phone number format is invalid.';
      case 20003:
        return 'Twilio authentication failed (check account SID/auth token).';
      default:
        return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeWhatsappAddress(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }

    if (trimmed.startsWith('whatsapp:')) {
      return trimmed;
    }

    return `whatsapp:${trimmed}`;
  }

  private normalizePhone(rawPhone?: string): string | null {
    if (!rawPhone) {
      return null;
    }

    const trimmed = rawPhone.trim();
    if (trimmed.length === 0) {
      return null;
    }

    if (trimmed.startsWith('+')) {
      const normalized = `+${trimmed.slice(1).replace(/\D/g, '')}`;
      return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
    }

    let digits = trimmed.replace(/\D/g, '');
    if (!digits) {
      return null;
    }

    if (digits.startsWith('00')) {
      const normalized = `+${digits.slice(2)}`;
      return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
    }

    if (digits.startsWith('549')) {
      const normalized = `+${digits}`;
      return /^\+\d{11,15}$/.test(normalized) ? normalized : null;
    }

    if (digits.startsWith('54')) {
      const normalized = `+${digits}`;
      return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
    }

    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    if (/^\d{10,11}$/.test(digits)) {
      return `+54${digits}`;
    }

    return null;
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }
}
