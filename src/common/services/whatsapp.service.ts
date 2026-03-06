import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

interface AppointmentWhatsappPayload {
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

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly whatsappEnabled: boolean;
  private readonly fromNumber?: string;
  private readonly doctorPhone?: string;
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

    if (!this.whatsappEnabled) {
      this.logger.warn(
        'WhatsApp notifications disabled (WHATSAPP_ENABLED and/or NOTIFICATIONS_WHATSAPP_ENABLED).',
      );
      return;
    }

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken || !this.fromNumber) {
      this.logger.warn(
        'Twilio WhatsApp not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_WHATSAPP_FROM.',
      );
      return;
    }

    try {
      this.twilioClient = twilio(accountSid, authToken);
      this.logger.log('Twilio WhatsApp service initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing Twilio WhatsApp service', error);
    }
  }

  async sendAppointmentCreated(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
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
    );
  }

  async sendAppointmentCancelled(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
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
    );
  }

  async send24HourReminder(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
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
    );
  }

  async send2HourReminder(
    payload: AppointmentWhatsappPayload,
  ): Promise<boolean> {
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
    );
  }

  private async sendToPatientAndDoctor(
    patientPhone: string | undefined,
    doctorPhone: string | undefined,
    patientMessage: string,
    doctorMessage: string,
  ): Promise<boolean> {
    const result = await Promise.all([
      this.sendMessage(patientPhone, patientMessage, 'patient'),
      this.sendMessage(
        doctorPhone ?? this.doctorPhone,
        doctorMessage,
        'doctor',
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
  ): Promise<boolean> {
    if (!this.twilioClient || !this.fromNumber || !this.whatsappEnabled) {
      return false;
    }

    const normalizedPhone = this.normalizePhone(rawPhone);
    if (!normalizedPhone) {
      this.logger.warn(
        `Skipping WhatsApp for ${recipient}: phone could not be normalized.`,
      );
      return false;
    }

    try {
      await this.twilioClient.messages.create({
        body: message,
        from: this.fromNumber,
        to: this.normalizeWhatsappAddress(normalizedPhone),
      });

      this.logger.log(`WhatsApp sent successfully to ${recipient}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending WhatsApp to ${recipient}`, error);
      return false;
    }
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
