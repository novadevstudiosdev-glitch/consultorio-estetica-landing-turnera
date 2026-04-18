import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum GiftCardStatus {
  PENDING = 'pending', // Esperando pago
  ACTIVE = 'active', // Pagada y lista para usar
  REDEEMED = 'redeemed', // Canjeada totalmente
  EXPIRED = 'expired', // Expirada (90 días)
  CANCELLED = 'cancelled', // Cancelada/Reembolsada
}

@Entity('gift_cards')
export class GiftCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  code: string; // Ej: "JG-2026-ABCD1234"

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Monto inicial

  @Column({
    name: 'remaining_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  remainingAmount: number; // Saldo restante (para uso parcial)

  @Column({
    type: 'varchar',
    length: 50,
    default: GiftCardStatus.PENDING,
  })
  @Index()
  status: GiftCardStatus;

  // Información del comprador
  @Column({ name: 'purchaser_name', type: 'varchar', length: 255 })
  purchaserName: string;

  @Column({ name: 'purchaser_email', type: 'varchar', length: 255 })
  purchaserEmail: string;

  @Column({
    name: 'purchaser_phone',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  purchaserPhone?: string;

  // Información del beneficiario
  @Column({ name: 'recipient_name', type: 'varchar', length: 255 })
  recipientName: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({
    name: 'recipient_phone',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  recipientPhone?: string;

  @Column({ name: 'personal_message', type: 'text', nullable: true })
  personalMessage?: string; // Mensaje personalizado del comprador

  // Fechas
  @Column({ name: 'purchase_date', type: 'timestamp', nullable: true })
  purchaseDate?: Date; // Cuando se pagó

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate?: Date; // 90 días después de purchase_date

  @Column({ name: 'redeemed_date', type: 'timestamp', nullable: true })
  redeemedDate?: Date;

  // Relación con admin que canjeó
  @Column({ name: 'redeemed_by_user_id', type: 'uuid', nullable: true })
  redeemedByUserId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'redeemed_by_user_id' })
  redeemedByUser?: User;

  // Pago
  @Column({ name: 'payment_id', type: 'varchar', length: 255, nullable: true })
  paymentId?: string; // Mercado Pago payment ID

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  paymentStatus?: string; // approved, pending, rejected

  // Notas admin
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
