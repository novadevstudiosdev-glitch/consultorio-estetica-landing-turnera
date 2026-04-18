import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface RecaptchaResponse {
  success: boolean;
  score: number;
  action: string;
  challenge_ts: string;
  hostname: string;
  'error-codes'?: string[];
}

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly secretKey: string;
  private readonly verifyUrl =
    'https://www.google.com/recaptcha/api/siteverify';
  private readonly minScore: number = 0.5; // Score mínimo aceptable para reCAPTCHA v3

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');

    if (!this.secretKey) {
      this.logger.warn('RECAPTCHA_SECRET_KEY no está configurada');
    }
  }

  /**
   * Verifica un token de reCAPTCHA v3
   * @param token Token recibido del frontend
   * @param expectedAction Acción esperada (ej: 'login', 'register')
   * @returns true si es válido, false si no
   */
  async verify(token: string, expectedAction?: string): Promise<boolean> {
    if (!this.secretKey) {
      this.logger.warn(
        'Skipping reCAPTCHA verification - secret key not configured',
      );
      return true; // En desarrollo, si no está configurado, permitir
    }

    try {
      const response = await axios.post<RecaptchaResponse>(
        this.verifyUrl,
        null,
        {
          params: {
            secret: this.secretKey,
            response: token,
          },
        },
      );

      const {
        success,
        score,
        action,
        'error-codes': errorCodes,
      } = response.data;

      // Log para debugging
      this.logger.debug(
        `reCAPTCHA verification: success=${success}, score=${score}, action=${action}`,
      );

      // Verificar que la petición fue exitosa
      if (!success) {
        this.logger.warn(
          `reCAPTCHA verification failed: ${errorCodes?.join(', ')}`,
        );
        return false;
      }

      // Verificar el score (solo para v3)
      if (score < this.minScore) {
        this.logger.warn(
          `reCAPTCHA score too low: ${score} < ${this.minScore}`,
        );
        return false;
      }

      // Verificar la acción si se especificó
      if (expectedAction && action !== expectedAction) {
        this.logger.warn(
          `reCAPTCHA action mismatch: expected=${expectedAction}, got=${action}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error verifying reCAPTCHA:', error.message);
      // En caso de error de red o de Google, rechazar la solicitud
      return false;
    }
  }

  /**
   * Verifica reCAPTCHA y lanza excepción si falla
   * @param token Token de reCAPTCHA
   * @param action Acción esperada
   */
  async verifyOrFail(token: string, action?: string): Promise<void> {
    const isValid = await this.verify(token, action);

    if (!isValid) {
      throw new BadRequestException(
        'Verificación de reCAPTCHA fallida. Por favor, intenta nuevamente.',
      );
    }
  }

  /**
   * Obtiene el score de un token sin validar
   * Útil para logging o analytics
   */
  async getScore(token: string): Promise<number | null> {
    if (!this.secretKey) {
      return null;
    }

    try {
      const response = await axios.post<RecaptchaResponse>(
        this.verifyUrl,
        null,
        {
          params: {
            secret: this.secretKey,
            response: token,
          },
        },
      );

      return response.data.success ? response.data.score : null;
    } catch (error) {
      this.logger.error('Error getting reCAPTCHA score:', error.message);
      return null;
    }
  }
}
