import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BlockedSlotType {
  VACATION = 'vacation', // Vacaciones
  HOLIDAY = 'holiday', // Feriado
  MAINTENANCE = 'maintenance', // Mantenimiento
  PERSONAL = 'personal', // Personal
  OTHER = 'other', // Otro
}

@Entity('blocked_slots')
@Index(['blockedDate', 'isActive'])
@Index('ux_blocked_slots_full_day_active', ['blockedDate'], {
  unique: true,
  where:
    '"is_active" = true AND "start_time" IS NULL AND "end_time" IS NULL',
})
@Index('ux_blocked_slots_time_active', ['blockedDate', 'startTime', 'endTime'], {
  unique: true,
  where:
    '"is_active" = true AND "start_time" IS NOT NULL AND "end_time" IS NOT NULL',
})
export class BlockedSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'blocked_date', type: 'date' })
  @Index()
  blockedDate: Date;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime?: string; // Si es null, bloquea TODO el día

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime?: string; // Si es null, bloquea TODO el día

  @Column({
    type: 'varchar',
    length: 50,
    default: BlockedSlotType.OTHER,
  })
  type: BlockedSlotType;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
