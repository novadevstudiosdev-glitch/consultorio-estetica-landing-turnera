import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Service } from '../../services/entities/service.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  GIFT_CARD = 'gift_card',
}

export enum PaymentMethod {
  MP = 'mp', // Mercado Pago
  MANUAL = 'manual', // Pago manual (efectivo/transferencia)
  GIFT_CARD = 'gift_card', // Gift card
  NONE = 'none', // Sin pago (ej: servicios gratuitos)
}

@Entity('appointments')
@Index(['appointmentDate', 'appointmentTime'], { unique: true })
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relaciones
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId?: string;

  @Column({ name: 'service_id', type: 'uuid' })
  @Index()
  serviceId: string;

  @Column({ name: 'gift_card_id', type: 'uuid', nullable: true })
  @Index()
  giftCardId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => Service, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  // Datos del paciente (duplicados para no registrados)
  @Column({ name: 'patient_name', type: 'varchar', length: 255 })
  patientName: string;

  @Column({ name: 'patient_email', type: 'varchar', length: 255 })
  @Index()
  patientEmail: string;

  @Column({ name: 'patient_phone', type: 'varchar', length: 50 })
  patientPhone: string;

  @Column({ name: 'patient_dni', type: 'varchar', length: 50, nullable: true })
  patientDni?: string;

  // Fecha y hora del turno
  @Column({ name: 'appointment_date', type: 'date' })
  @Index()
  appointmentDate: Date;

  @Column({ name: 'appointment_time', type: 'time' })
  @Index()
  appointmentTime: string;

  // Estado
  @Column({
    type: 'varchar',
    length: 50,
    default: AppointmentStatus.PENDING,
  })
  @Index()
  status: AppointmentStatus;

  // Pago
  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 50,
    default: PaymentStatus.PENDING,
  })
  @Index()
  paymentStatus: PaymentStatus;

  @Column({
    name: 'deposit_paid',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  depositPaid: number;

  @Column({ name: 'payment_id', type: 'varchar', length: 255, nullable: true })
  paymentId?: string;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  paymentMethod?: PaymentMethod;

  // Notas
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'patient_notes', type: 'text', nullable: true })
  patientNotes?: string;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location?: string;

  // Flags
  @Column({ name: 'created_by_admin', type: 'boolean', default: false })
  createdByAdmin: boolean;

  @Column({ name: 'cancelled_by', type: 'varchar', length: 50, nullable: true })
  cancelledBy?: string; // 'admin', 'patient', null

  @Column({ name: 'reminder_24h_sent', type: 'boolean', default: false })
  reminder24hSent: boolean;

  @Column({ name: 'reminder_2h_sent', type: 'boolean', default: false })
  reminder2hSent: boolean;

  @Column({ name: 'confirmation_sent', type: 'boolean', default: false })
  confirmationSent: boolean;

  // Timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt?: Date;
}
