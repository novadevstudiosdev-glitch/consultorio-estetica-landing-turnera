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
import { Appointment } from '../../appointments/entities/appointment.entity';

@Entity('reviews')
@Index(['isApproved', 'createdAt'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relación con usuario (opcional - puede ser anónimo)
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @ManyToOne(() => User, (user) => user.reviews, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  // Relación con turno (requerido)
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId: string;

  @ManyToOne(() => Appointment)
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;

  // Calificación (1-5 estrellas)
  @Column({ type: 'int' })
  @Index()
  rating: number;

  // Comentario
  @Column({ type: 'text', nullable: true })
  comment?: string;

  // Nombre del reviewer (si no tiene user, puede ser anónimo)
  @Column({ name: 'reviewer_name', type: 'varchar', length: 255 })
  reviewerName: string;

  // Aprobación de admin
  @Column({ name: 'is_approved', type: 'boolean', default: false })
  @Index()
  isApproved: boolean;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by_user_id' })
  approvedByUser?: User;

  // Respuesta del admin (opcional)
  @Column({ name: 'admin_response', type: 'text', nullable: true })
  adminResponse?: string;

  @Column({ name: 'admin_response_at', type: 'timestamp', nullable: true })
  adminResponseAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
