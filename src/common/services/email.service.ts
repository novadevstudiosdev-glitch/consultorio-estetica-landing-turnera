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

    const verificationUrl = `${this.configService.get(
      'FRONTEND_URL',
    )}/verify-email?token=${token}`;

    const html = this.getVerificationEmailTemplate(fullName, verificationUrl);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: 'Verifica tu cuenta - Turnera Médica',
        html,
      });

      if (error) throw error;

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

    const resetUrl = `${this.configService.get(
      'FRONTEND_URL',
    )}/reset-password?token=${token}`;

    const html = this.getPasswordResetEmailTemplate(fullName, resetUrl);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: 'Recupera tu contraseña - Turnera Médica',
        html,
      });

      if (error) throw error;

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
        subject: 'Turno confirmado - Turnera Médica',
        html,
      });

      if (error) throw error;

      this.logger.log(
        `📧 Appointment confirmation sent to ${email} (ID: ${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error sending appointment confirmation to ${email}:`,
        error,
      );
      // No bloquea la creación del turno
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
        subject: 'Recordatorio de turno - Turnera Médica',
        html,
      });

      if (error) throw error;

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
        subject: 'Turno cancelado - Turnera Médica',
        html,
      });

      if (error) throw error;

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

  // ============================================================
  // BASE TEMPLATE (ESTÉTICA ROSA / PRO)
  // ============================================================

  private getBaseEmailTemplate(params: {
    preheader?: string;
    title: string;
    greetingName: string;
    introHtml: string;
    bodyHtml: string;
    cta?: { label: string; url: string };
    footerLines?: string[];
    variant?: 'default' | 'success' | 'warning' | 'danger';
  }): string {
    const {
      preheader = '',
      title,
      greetingName,
      introHtml,
      bodyHtml,
      cta,
      footerLines = [],
      variant = 'default',
    } = params;

    // Paleta basada en tu web (rosa empolvado elegante)
    const COLORS = {
      bg: '#FAF4F6',
      card: '#FFFFFF',
      text: '#2E2E2E',
      muted: '#7A7A7A',
      border: '#EAD3D8',

      primary: '#D9A3AE',
      primaryHover: '#C98F9B',
      soft: '#F3DCE2',

      // Variantes suaves (sin amarillo ni rojo fuerte)
      success: '#BFA2AA',
      warning: '#D9A3AE',
      danger: '#C17886',
    };

    const variantMap = {
      default: {
        accent: COLORS.primary,
        accentSoft: COLORS.soft,
        label: 'Info',
      },
      success: {
        accent: COLORS.success,
        accentSoft: '#F5EFF1',
        label: 'Confirmado',
      },
      warning: {
        accent: COLORS.warning,
        accentSoft: '#F3DCE2',
        label: 'Recordatorio',
      },
      danger: {
        accent: COLORS.danger,
        accentSoft: '#F7E6EA',
        label: 'Cancelado',
      },
    }[variant];

    const businessName =
      this.configService.get('BUSINESS_NAME') || 'Turnera Médica';
    const businessAddress = this.configService.get('BUSINESS_ADDRESS') || '';
    const businessPhone = this.configService.get('BUSINESS_PHONE') || '';
    const footerDefault = [businessName, businessAddress, businessPhone].filter(
      Boolean,
    );
    const finalFooterLines = footerLines.length ? footerLines : footerDefault;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting" />
  <title>${title}</title>
  <style>
    html, body { margin:0; padding:0; background:${COLORS.bg}; }
    img { border:0; outline:none; text-decoration:none; }
    table { border-collapse:collapse; }
    a { text-decoration:none; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: ${COLORS.text};
      line-height: 1.55;
    }

    .wrap { width:100%; background:${COLORS.bg}; padding:24px 12px; }
    .container { max-width:640px; margin:0 auto; }

    .card {
      background:${COLORS.card};
      border:1px solid ${COLORS.border};
      border-radius:16px;
      overflow:hidden;
      box-shadow:0 8px 24px rgba(17, 24, 39, 0.06);
    }

    .header {
      padding:28px 26px 18px 26px;
      background: linear-gradient(135deg, ${COLORS.soft} 0%, #FFFFFF 60%);
      border-bottom:1px solid ${COLORS.border};
    }

    .badge {
      display:inline-block;
      padding:6px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:700;
      color:${variantMap.accent};
      background:${variantMap.accentSoft};
      border:1px solid ${COLORS.border};
      letter-spacing:0.2px;
    }

    .title {
      margin:14px 0 0 0;
      font-size:22px;
      line-height:1.25;
      letter-spacing:-0.2px;
    }

    .content { padding:22px 26px 8px 26px; font-size:15px; }
    .muted { color:${COLORS.muted}; }

    .infoBox {
      margin:16px 0;
      padding:14px 14px;
      border-radius:14px;
      background:#FFFFFF;
      border:1px solid ${COLORS.border};
    }

    .infoRow { margin:0 0 8px 0; font-size:14px; }
    .infoRow strong { display:inline-block; min-width:72px; }

    .ctaWrap { text-align:center; padding:10px 26px 22px 26px; }

    .btn {
      display:inline-block;
      background:${COLORS.primary};
      color:#FFFFFF !important;
      padding:12px 22px;
      border-radius:999px;
      font-weight:700;
      font-size:14px;
      letter-spacing:0.3px;
      box-shadow:0 6px 16px rgba(201, 143, 155, 0.35);
      transition: all 0.2s ease;
    }
    .btn:hover { background:${COLORS.primaryHover}; }

    .divider { height:1px; background:${COLORS.border}; margin:18px 0; }

    .link {
      color:${COLORS.primaryHover};
      word-break:break-all;
      font-size:13px;
    }

    .footer {
      padding:16px 26px 22px 26px;
      font-size:12px;
      color:${COLORS.muted};
    }

    .preheader {
      display:none !important;
      visibility:hidden;
      opacity:0;
      color:transparent;
      height:0;
      width:0;
      overflow:hidden;
      mso-hide:all;
    }
  </style>
</head>
<body>
  <span class="preheader">${preheader}</span>

  <div class="wrap">
    <div class="container">
      <div class="card">
        <div class="header">
          <span class="badge">${variantMap.label}</span>
          <h1 class="title">${title}</h1>
        </div>

        <div class="content">
          <p>Hola <strong>${greetingName}</strong>,</p>
          ${introHtml}
          ${bodyHtml}
        </div>

        ${
          cta
            ? `
          <div class="ctaWrap">
            <a class="btn" href="${cta.url}" target="_blank" rel="noopener noreferrer">
              ${cta.label}
            </a>
            <div class="divider"></div>
            <p class="muted" style="margin:0 0 8px 0;">Si el botón no funciona, copiá y pegá este enlace:</p>
            <a class="link" href="${cta.url}" target="_blank" rel="noopener noreferrer">${cta.url}</a>
          </div>
        `
            : `
          <div class="ctaWrap">
            <div class="divider"></div>
          </div>
        `
        }

        <div class="footer">
          ${finalFooterLines.map((l) => `<div>${l}</div>`).join('')}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  // ============================================================
  // EMAIL TEMPLATES (MISMA LÍNEA VISUAL)
  // ============================================================

  private getVerificationEmailTemplate(
    fullName: string,
    verificationUrl: string,
  ): string {
    return this.getBaseEmailTemplate({
      preheader: 'Verificá tu email para activar tu cuenta.',
      title: 'Verificá tu cuenta',
      greetingName: fullName,
      variant: 'default',
      introHtml: `<p class="muted">Gracias por registrarte. Para activar tu cuenta, confirmá tu email.</p>`,
      bodyHtml: `
        <div class="infoBox">
          <p class="infoRow" style="margin:0;">Este enlace vence en <strong>24 horas</strong>.</p>
        </div>
      `,
      cta: { label: 'Verificar email', url: verificationUrl },
    });
  }

  private getPasswordResetEmailTemplate(
    fullName: string,
    resetUrl: string,
  ): string {
    return this.getBaseEmailTemplate({
      preheader: 'Restablecé tu contraseña de forma segura.',
      title: 'Restablecer contraseña',
      greetingName: fullName,
      variant: 'warning',
      introHtml: `<p class="muted">Recibimos una solicitud para restablecer tu contraseña.</p>`,
      bodyHtml: `
        <div class="infoBox">
          <p class="infoRow" style="margin:0 0 8px 0;">Este enlace vence en <strong>1 hora</strong>.</p>
          <p class="infoRow muted" style="margin:0;">Si vos no pediste este cambio, podés ignorar este email.</p>
        </div>
      `,
      cta: { label: 'Restablecer contraseña', url: resetUrl },
    });
  }

  private getAppointmentConfirmationTemplate(data: {
    patientName: string;
    serviceName: string;
    date: string;
    time: string;
    depositAmount?: number;
  }): string {
    return this.getBaseEmailTemplate({
      preheader: 'Tu turno quedó confirmado.',
      title: 'Turno confirmado',
      greetingName: data.patientName,
      variant: 'success',
      introHtml: `<p class="muted">Tu turno fue confirmado con los siguientes datos:</p>`,
      bodyHtml: `
        <div class="infoBox">
          <p class="infoRow"><strong>Servicio:</strong> ${data.serviceName}</p>
          <p class="infoRow"><strong>Fecha:</strong> ${data.date}</p>
          <p class="infoRow"><strong>Hora:</strong> ${data.time}</p>
          ${
            data.depositAmount
              ? `<p class="infoRow"><strong>Seña:</strong> $${data.depositAmount}</p>`
              : ``
          }
        </div>
        <p style="margin-top:14px;">Te esperamos 🌸</p>
      `,
    });
  }

  private getAppointmentReminderTemplate(data: {
    patientName: string;
    serviceName: string;
    date: string;
    time: string;
  }): string {
    return this.getBaseEmailTemplate({
      preheader: 'Recordatorio: tenés un turno pronto.',
      title: 'Recordatorio de turno',
      greetingName: data.patientName,
      variant: 'warning',
      introHtml: `<p class="muted">Te recordamos que <strong>mañana</strong> tenés turno:</p>`,
      bodyHtml: `
        <div class="infoBox">
          <p class="infoRow"><strong>Servicio:</strong> ${data.serviceName}</p>
          <p class="infoRow"><strong>Fecha:</strong> ${data.date}</p>
          <p class="infoRow"><strong>Hora:</strong> ${data.time}</p>
        </div>
        <p style="margin-top:14px;">Si necesitás reprogramar, hacelo desde la app.</p>
      `,
    });
  }

  private getAppointmentCancellationTemplate(data: {
    patientName: string;
    serviceName: string;
    date: string;
    time: string;
    reason?: string;
  }): string {
    return this.getBaseEmailTemplate({
      preheader: 'Tu turno fue cancelado.',
      title: 'Turno cancelado',
      greetingName: data.patientName,
      variant: 'danger',
      introHtml: `<p class="muted">Tu turno ha sido cancelado:</p>`,
      bodyHtml: `
        <div class="infoBox">
          <p class="infoRow"><strong>Servicio:</strong> ${data.serviceName}</p>
          <p class="infoRow"><strong>Fecha:</strong> ${data.date}</p>
          <p class="infoRow"><strong>Hora:</strong> ${data.time}</p>
          ${data.reason ? `<p class="infoRow"><strong>Motivo:</strong> ${data.reason}</p>` : ''}
        </div>
        <p style="margin-top:14px;">Podés reagendar cuando quieras desde la app.</p>
      `,
    });
  }
}
