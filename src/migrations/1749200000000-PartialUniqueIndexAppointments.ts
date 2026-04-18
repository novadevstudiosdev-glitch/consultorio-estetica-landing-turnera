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
    // Drop any existing unique constraint/index on (appointment_date, appointment_time),
    // regardless of its auto-generated name. (It could be a UNIQUE constraint or a UNIQUE index.)
    await queryRunner.query(`
      DO $$
      DECLARE
        att_date INT;
        att_time INT;
        con_name TEXT;
        idx_name TEXT;
      BEGIN
        SELECT attnum INTO att_date
        FROM pg_attribute
        WHERE attrelid = 'appointments'::regclass
          AND attname = 'appointment_date';

        SELECT attnum INTO att_time
        FROM pg_attribute
        WHERE attrelid = 'appointments'::regclass
          AND attname = 'appointment_time';

        IF att_date IS NOT NULL AND att_time IS NOT NULL THEN
          -- Drop UNIQUE constraints (backed by an index).
          FOR con_name IN
            SELECT c.conname
            FROM pg_constraint c
            WHERE c.conrelid = 'appointments'::regclass
              AND c.contype = 'u'
              AND array_length(c.conkey, 1) = 2
              AND c.conkey @> ARRAY[att_date, att_time]::smallint[]
          LOOP
            EXECUTE format('ALTER TABLE appointments DROP CONSTRAINT IF EXISTS %I', con_name);
          END LOOP;

          -- Drop standalone UNIQUE indexes.
          FOR idx_name IN
            SELECT ci.relname
            FROM pg_index i
            JOIN pg_class ci ON ci.oid = i.indexrelid
            WHERE i.indrelid = 'appointments'::regclass
              AND i.indisunique
              AND array_length(i.indkey::smallint[], 1) = 2
              AND i.indkey::smallint[] @> ARRAY[att_date, att_time]::smallint[]
          LOOP
            EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
          END LOOP;
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
