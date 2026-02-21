import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private fromEmail: string;
  private fromName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM_ADDRESS') ||
      'onboarding@resend.dev';
    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ||
      'Dra. Jaquelina Grassetti';

    if (!apiKey) {
      this.logger.warn(
        '⚠️ RESEND_API_KEY not configured. Emails will be logged but not sent.',
      );
      return;
    }

    try {
      this.resend = new Resend(apiKey);
      this.logger.log('✅ Resend email service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Error initializing Resend:', error);
    }
  }

  /**
   * Enviar email de verificación
   */
  async sendVerificationEmail(
    email: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`📧 [SIMULATED] Verification email to ${email}`);
      this.logger.warn(`Token: ${token}`);
      return;
    }

    const verificationUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${token}`;

    const html = this.getVerificationEmailTemplate(fullName, verificationUrl);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: 'Verifica tu cuenta - Turnera Médica',
        html,
      });

      if (error) {
        throw error;
      }

      this.logger.log(
        `📧 Verification email sent to ${email} (ID: ${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error sending verification email to ${email}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enviar email de reset de contraseña
   */
  async sendPasswordResetEmail(
    email: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`📧 [SIMULATED] Password reset email to ${email}`);
      this.logger.warn(`Token: ${token}`);
      return;
    }

    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${token}`;

    const html = this.getPasswordResetEmailTemplate(fullName, resetUrl);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: 'Recupera tu contraseña - Turnera Médica',
        html,
      });

      if (error) {
        throw error;
      }

      this.logger.log(
        `📧 Password reset email sent to ${email} (ID: ${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error sending password reset email to ${email}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enviar email de confirmación de turno
   */
  async sendAppointmentConfirmation(
    email: string,
    appointmentData: {
      patientName: string;
      serviceName: string;
      date: string;
      time: string;
      depositAmount?: number;
    },
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`📧 [SIMULATED] Appointment confirmation to ${email}`);
      return;
    }

    const html = this.getAppointmentConfirmationTemplate(appointmentData);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: '✅ Turno Confirmado - Turnera Médica',
        html,
      });

      if (error) {
        throw error;
      }

      this.logger.log(
        `📧 Appointment confirmation sent to ${email} (ID: ${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error sending appointment confirmation to ${email}:`,
        error,
      );
      // No lanzar error para no bloquear la creación del turno
      // Solo loguear
    }
  }

  /**
   * Enviar recordatorio de turno (24 horas antes)
   */
  async sendAppointmentReminder(
    email: string,
    appointmentData: {
      patientName: string;
      serviceName: string;
      date: string;
      time: string;
    },
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`📧 [SIMULATED] Appointment reminder to ${email}`);
      return;
    }

    const html = this.getAppointmentReminderTemplate(appointmentData);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: '⏰ Recordatorio de Turno - Mañana',
        html,
      });

      if (error) {
        throw error;
      }

      this.logger.log(
        `📧 Appointment reminder sent to ${email} (ID: ${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error sending appointment reminder to ${email}:`,
        error,
      );
    }
  }

  /**
   * Enviar email de cancelación de turno
   */
  async sendAppointmentCancellation(
    email: string,
    appointmentData: {
      patientName: string;
      serviceName: string;
      date: string;
      time: string;
      reason?: string;
    },
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`📧 [SIMULATED] Appointment cancellation to ${email}`);
      return;
    }

    const html = this.getAppointmentCancellationTemplate(appointmentData);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: '❌ Turno Cancelado - Turnera Médica',
        html,
      });

      if (error) {
        throw error;
      }

      this.logger.log(
        `📧 Appointment cancellation sent to ${email} (ID: ${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error sending appointment cancellation to ${email}:`,
        error,
      );
    }
  }

  // ============================================
  // TEMPLATES HTML
  // ============================================

  private getVerificationEmailTemplate(
    fullName: string,
    verificationUrl: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #F5E6D3 0%, #F8C4D8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .button { display: inline-block; padding: 12px 30px; background: #F8C4D8; color: #333; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #333; margin: 0;">¡Bienvenido/a! 🎉</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${fullName}</strong>,</p>
            <p>Gracias por registrarte. Por favor verifica tu email haciendo click en el botón:</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verificar mi email</a>
            </div>

            <p>O copia este enlace en tu navegador:</p>
            <p style="word-break: break-all; color: #666; font-size: 14px;">${verificationUrl}</p>

            <p><strong>Este enlace expira en 24 horas.</strong></p>
          </div>
          <div class="footer">
            <p>${this.configService.get('BUSINESS_NAME') || 'Turnera Médica'}</p>
            <p>${this.configService.get('BUSINESS_ADDRESS') || ''}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(
    fullName: string,
    resetUrl: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #F5E6D3 0%, #F8C4D8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .button { display: inline-block; padding: 12px 30px; background: #F8C4D8; color: #333; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #333; margin: 0;">Recupera tu contraseña 🔐</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${fullName}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Restablecer contraseña</a>
            </div>

            <p>O copia este enlace:</p>
            <p style="word-break: break-all; color: #666; font-size: 14px;">${resetUrl}</p>

            <p><strong>Este enlace expira en 1 hora.</strong></p>
            <p>Si no solicitaste este cambio, ignora este email.</p>
          </div>
          <div class="footer">
            <p>${this.configService.get('BUSINESS_NAME') || 'Turnera Médica'}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAppointmentConfirmationTemplate(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #F5E6D3 0%, #F8C4D8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .info-box { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #333; margin: 0;">✅ Turno Confirmado</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${data.patientName}</strong>,</p>
            <p>Tu turno ha sido confirmado con los siguientes datos:</p>
            
            <div class="info-box">
              <p><strong>Servicio:</strong> ${data.serviceName}</p>
              <p><strong>Fecha:</strong> ${data.date}</p>
              <p><strong>Hora:</strong> ${data.time}</p>
              ${data.depositAmount ? `<p><strong>Seña requerida:</strong> $${data.depositAmount}</p>` : ''}
            </div>

            <p>Te esperamos! 🌸</p>
          </div>
          <div class="footer">
            <p>${this.configService.get('BUSINESS_NAME') || 'Turnera Médica'}</p>
            <p>${this.configService.get('BUSINESS_PHONE') || ''}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAppointmentReminderTemplate(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #FFE5B4 0%, #FFD700 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .info-box { background: #fff9e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FFD700; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #333; margin: 0;">⏰ Recordatorio de Turno</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${data.patientName}</strong>,</p>
            <p>Te recordamos que <strong>mañana</strong> tienes turno:</p>
            
            <div class="info-box">
              <p><strong>Servicio:</strong> ${data.serviceName}</p>
              <p><strong>Fecha:</strong> ${data.date}</p>
              <p><strong>Hora:</strong> ${data.time}</p>
            </div>

            <p>¡Te esperamos! 🌸</p>
          </div>
          <div class="footer">
            <p>${this.configService.get('BUSINESS_NAME') || 'Turnera Médica'}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAppointmentCancellationTemplate(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ffebee; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .info-box { background: #fff5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #c62828; margin: 0;">❌ Turno Cancelado</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${data.patientName}</strong>,</p>
            <p>Tu turno ha sido cancelado:</p>
            
            <div class="info-box">
              <p><strong>Servicio:</strong> ${data.serviceName}</p>
              <p><strong>Fecha:</strong> ${data.date}</p>
              <p><strong>Hora:</strong> ${data.time}</p>
              ${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}
            </div>

            <p>Podés reagendar cuando quieras.</p>
          </div>
          <div class="footer">
            <p>${this.configService.get('BUSINESS_NAME') || 'Turnera Médica'}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
