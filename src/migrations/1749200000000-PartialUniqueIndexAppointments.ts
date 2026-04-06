import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the global unique constraint on (appointment_date, appointment_time)
 * with a partial unique index that excludes cancelled appointments.
 *
 * This allows rebooking a time slot after a cancellation, without losing
 * any existing appointment records.
 */
export class PartialUniqueIndexAppointments1749200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique index on (appointment_date, appointment_time),
    // regardless of its auto-generated name.
    await queryRunner.query(`
      DO $$
      DECLARE
        idx_name TEXT;
      BEGIN
        SELECT indexname INTO idx_name
        FROM pg_indexes
        WHERE tablename = 'appointments'
          AND indexdef ILIKE '%appointment_date%'
          AND indexdef ILIKE '%appointment_time%'
          AND indexdef ILIKE '%unique%';

        IF idx_name IS NOT NULL THEN
          EXECUTE 'DROP INDEX IF EXISTS "' || idx_name || '"';
        END IF;
      END $$;
    `);

    // Create a partial unique index that only applies to non-cancelled appointments.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_appointments_date_time_active"
      ON appointments(appointment_date, appointment_time)
      WHERE status != 'cancelled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_appointments_date_time_active"`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_appointments_date_time_unique"
      ON appointments(appointment_date, appointment_time)
    `);
  }
}
