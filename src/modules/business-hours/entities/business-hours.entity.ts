import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

@Entity('business_hours')
@Index(['dayOfWeek', 'isActive'])
export class BusinessHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'day_of_week',
    type: 'varchar',
    length: 50,
  })
  @Index()
  dayOfWeek: DayOfWeek;

  @Column({ name: 'open_time', type: 'time' })
  openTime: string; // Formato: HH:mm (ej: "09:00")

  @Column({ name: 'close_time', type: 'time' })
  closeTime: string; // Formato: HH:mm (ej: "18:00")

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ name: 'slot_duration_minutes', type: 'int', default: 30 })
  slotDurationMinutes: number; // Intervalo entre slots (ej: 30 min)

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
