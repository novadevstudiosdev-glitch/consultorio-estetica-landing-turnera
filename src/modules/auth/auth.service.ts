import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User, AuthProvider } from '../users/entities/user.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { EmailVerificationToken } from '../users/entities/email-verification-token.entity';
import { UsersService } from '../users/users.service';
import { RecaptchaService } from '../../common/services/recaptcha.service';
import { EmailService } from '../../common/services/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    emailVerified: boolean;
    avatarUrl?: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private recaptchaService: RecaptchaService,
    private emailService: EmailService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(EmailVerificationToken)
    private emailVerificationTokenRepository: Repository<EmailVerificationToken>,
  ) {
    // Inicializar Google OAuth Client
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  /**
   * Registro tradicional con email y password
   */
  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Verificar reCAPTCHA
    await this.recaptchaService.verifyOrFail(
      registerDto.recaptchaToken,
      'register',
    );

    // Verificar si el email ya existe
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Verificar DNI si se proporcionó
    if (registerDto.dni) {
      const existingDni = await this.usersService.findByDni(registerDto.dni);
      if (existingDni) {
        throw new ConflictException('El DNI ya está registrado');
      }
    }

    // Crear usuario
    const user = this.usersRepository.create({
      email: registerDto.email,
      passwordHash: registerDto.password, // Se hasheará en el hook @BeforeInsert
      fullName: registerDto.fullName,
      phone: registerDto.phone,
      dni: registerDto.dni,
      authProvider: AuthProvider.LOCAL,
      emailVerified: false,
    });

    await this.usersRepository.save(user);

    // Generar token de verificación de email
    await this.sendVerificationEmail(user);

    // Generar JWT
    const accessToken = this.generateJwt(user);

    return {
      accessToken,
      user: this.getUserResponse(user),
    };
  }

  /**
   * Login tradicional con email y password
   */
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    // Verificar reCAPTCHA
    await this.recaptchaService.verifyOrFail(loginDto.recaptchaToken, 'login');

    // Buscar usuario
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar que el usuario tenga password (no sea OAuth)
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta fue creada con Google. Por favor, inicia sesión con Google.',
      );
    }

    // Validar password
    const isPasswordValid = await user.validatePassword(loginDto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar que el usuario esté activo
    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta ha sido desactivada');
    }

    // Nota: No requerimos email verificado para login, pero el frontend puede manejarlo
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Por favor, verifica tu email antes de iniciar sesión',
      );
    }

    // Generar JWT
    const accessToken = this.generateJwt(user);

    return {
      accessToken,
      user: this.getUserResponse(user),
    };
  }

  /**
   * Login con Google OAuth
   */
  async googleAuth(googleAuthDto: GoogleAuthDto): Promise<AuthResponse> {
    // Verificar reCAPTCHA
    await this.recaptchaService.verifyOrFail(
      googleAuthDto.recaptchaToken,
      'google_auth',
    );

    try {
      // Verificar token de Google
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleAuthDto.googleToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new BadRequestException('Token de Google inválido');
      }

      const { sub: googleId, email, name, picture } = payload;

      // Buscar usuario por Google ID
      let user = await this.usersService.findByGoogleId(googleId);

      if (!user) {
        // Buscar por email (en caso de que exista con auth local)
        user = await this.usersService.findByEmail(email);

        if (user) {
          // Usuario existe con auth local, vincular Google
          user.googleId = googleId;
          user.avatarUrl = picture;
          user.authProvider = AuthProvider.GOOGLE;
          user.emailVerified = true; // Google ya verificó el email
          await this.usersRepository.save(user);
        } else {
          // Crear nuevo usuario con Google
          user = this.usersRepository.create({
            email,
            fullName: name,
            googleId,
            avatarUrl: picture,
            authProvider: AuthProvider.GOOGLE,
            emailVerified: true, // Google ya verificó el email
          });
          await this.usersRepository.save(user);
        }
      }

      // Verificar que el usuario esté activo
      if (!user.isActive) {
        throw new UnauthorizedException('Tu cuenta ha sido desactivada');
      }

      // Generar JWT
      const accessToken = this.generateJwt(user);

      return {
        accessToken,
        user: this.getUserResponse(user),
      };
    } catch (error) {
      this.logger.error('Error en Google Auth:', error);
      throw new BadRequestException('Error al autenticar con Google');
    }
  }

  /**
   * Enviar email de verificación
   */
  async sendVerificationEmail(user: User): Promise<void> {
    // Generar token único
    const token = this.generateRandomToken();

    // Crear registro en DB
    const verificationToken = this.emailVerificationTokenRepository.create({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
    });

    await this.emailVerificationTokenRepository.save(verificationToken);

    // Enviar email
    await this.emailService.sendVerificationEmail(
      user.email,
      user.fullName,
      token,
    );
  }

  /**
   * Verificar email con token
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    // Buscar token
    const verificationToken =
      await this.emailVerificationTokenRepository.findOne({
        where: {
          token,
          verified: false,
        },
        relations: ['user'],
      });

    if (!verificationToken) {
      throw new BadRequestException('Token de verificación inválido');
    }

    // Verificar que no esté expirado
    if (verificationToken.isExpired()) {
      throw new BadRequestException('El token de verificación ha expirado');
    }

    // Marcar token como verificado
    verificationToken.verified = true;
    await this.emailVerificationTokenRepository.save(verificationToken);

    // Marcar email como verificado en el usuario
    await this.usersService.verifyEmail(verificationToken.userId);

    return { message: 'Email verificado exitosamente' };
  }

  /**
   * Solicitar reset de password
   */
  async forgotPassword(
    email: string,
    recaptchaToken: string,
  ): Promise<{ message: string }> {
    // Verificar reCAPTCHA
    await this.recaptchaService.verifyOrFail(recaptchaToken, 'forgot_password');

    // Buscar usuario
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Por seguridad, no revelar si el email existe
      return {
        message:
          'Si el email existe, recibirás instrucciones para resetear tu contraseña',
      };
    }

    // Verificar que no sea cuenta de Google
    if (user.authProvider === AuthProvider.GOOGLE && !user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta fue creada con Google. No puedes resetear la contraseña.',
      );
    }

    // Generar token
    const token = this.generateRandomToken();

    // Crear registro en DB
    const resetToken = this.passwordResetTokenRepository.create({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    });

    await this.passwordResetTokenRepository.save(resetToken);

    // Enviar email
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.fullName,
      token,
    );

    return {
      message:
        'Si el email existe, recibirás instrucciones para resetear tu contraseña',
    };
  }

  /**
   * Resetear password con token
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // Buscar token
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        token,
        used: false,
      },
      relations: ['user'],
    });

    if (!resetToken) {
      throw new BadRequestException('Token de reseteo inválido');
    }

    // Verificar que no esté expirado
    if (resetToken.isExpired()) {
      throw new BadRequestException('El token de reseteo ha expirado');
    }

    // Actualizar password
    resetToken.user.passwordHash = newPassword; // Se hasheará en el hook @BeforeUpdate
    await this.usersRepository.save(resetToken.user);

    // Marcar token como usado
    resetToken.used = true;
    await this.passwordResetTokenRepository.save(resetToken);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  /**
   * Obtener perfil del usuario actual
   */
  async getProfile(userId: string): Promise<User> {
    return await this.usersService.findOne(userId);
  }

  /**
   * Generar JWT token
   */
  private generateJwt(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Generar token aleatorio seguro
   */
  private generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Formatear respuesta de usuario
   */
  private getUserResponse(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    };
  }
}
