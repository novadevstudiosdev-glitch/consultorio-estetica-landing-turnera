import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessHoursLocation1749400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add location column to business_hours table
    await queryRunner.query(
      `ALTER TABLE business_hours ADD COLUMN location VARCHAR(100) NOT NULL DEFAULT 'Rosario'`,
    );

    // Create index for faster queries
    await queryRunner.query(
      `CREATE INDEX IDX_business_hours_location ON business_hours(location)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IDX_business_hours_location`,
    );
    await queryRunner.query(
      `ALTER TABLE business_hours DROP COLUMN location`,
    );
  }
}
