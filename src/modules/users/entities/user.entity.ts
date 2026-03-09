import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Exclude } from 'class-transformer';
import { Appointment } from '../../appointments/entities/appointment.entity';
import { Review } from '../../reviews/entities/review.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { EmailVerificationToken } from './email-verification-token.entity';

export enum UserRole {
  ADMIN = 'admin',
  PATIENT = 'patient',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index({ unique: true })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  @Exclude() // No exponer en responses
  passwordHash?: string;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified: boolean;

  // OAuth fields
  @Column({
    name: 'google_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
  })
  @Index({ unique: true })
  googleId?: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({
    name: 'auth_provider',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: AuthProvider.LOCAL,
  })
  authProvider?: AuthProvider;

  // User info
  @Column({
    type: 'varchar',
    length: 50,
    default: UserRole.PATIENT,
  })
  role: UserRole;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  @Index({ unique: true })
  dni?: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ name: 'phone_verified', type: 'boolean', default: false })
  phoneVerified: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Appointment, (appointment) => appointment.user)
  appointments: Appointment[];

  //   @OneToMany(() => MedicalRecord, (record) => record.user)
  //   medicalRecords: MedicalRecord[];

  //   @OneToMany(() => MedicalRecord, (record) => record.createdByAdmin)
  //   createdMedicalRecords: MedicalRecord[];

  @OneToMany(() => Review, (review) => review.user)
  reviews: Review[];

  @OneToMany(() => PasswordResetToken, (token) => token.user)
  passwordResetTokens: PasswordResetToken[];

  @OneToMany(() => EmailVerificationToken, (token) => token.user)
  emailVerificationTokens: EmailVerificationToken[];

  // Methods
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    // Solo hashear si hay password y fue modificada
    if (this.passwordHash && !this.passwordHash.startsWith('$2')) {
      const salt = await bcrypt.genSalt(10);
      this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    if (!this.passwordHash) {
      return false;
    }
    return await bcrypt.compare(password, this.passwordHash);
  }

  // Helper methods
  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  isPatient(): boolean {
    return this.role === UserRole.PATIENT;
  }

  canLogin(): boolean {
    return (
      this.isActive &&
      (this.emailVerified || this.authProvider === AuthProvider.GOOGLE)
    );
  }
}
