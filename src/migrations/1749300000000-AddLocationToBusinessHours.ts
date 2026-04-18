import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddLocationToBusinessHours1749300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if location column already exists before adding
    const table = await queryRunner.getTable('business_hours');
    const locationColumnExists = table?.columns.some(
      (col) => col.name === 'location',
    );

    if (!locationColumnExists) {
      // Add location column with default value 'Rosario' - existing rows will get this value
      // ✅ NO DATA IS LOST - just adding a new column with a default value
      await queryRunner.addColumn(
        'business_hours',
        new TableColumn({
          name: 'location',
          type: 'varchar',
          length: '100',
          default: "'Rosario'",
          isNullable: false,
        }),
      );
    }

    // Create new index for location + dayOfWeek + isActive (for better query performance)
    try {
      await queryRunner.createIndex(
        'business_hours',
        new TableIndex({
          name: 'IDX_business_hours_location_dayOfWeek_isActive',
          columnNames: ['location', 'day_of_week', 'is_active'],
        }),
      );
    } catch {
      // Index might already exist, ignore error
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This is for rollback in case migration fails - can be executed with: npm run typeorm migration:revert
    try {
      await queryRunner.dropIndex(
        'business_hours',
        'IDX_business_hours_location_dayOfWeek_isActive',
      );
    } catch {
      // Index might not exist, ignore error
    }

    // Remove location column (only if reverting)
    const table = await queryRunner.getTable('business_hours');
    const locationColumnExists = table?.columns.some(
      (col) => col.name === 'location',
    );

    if (locationColumnExists) {
      await queryRunner.dropColumn('business_hours', 'location');
    }
  }
}
