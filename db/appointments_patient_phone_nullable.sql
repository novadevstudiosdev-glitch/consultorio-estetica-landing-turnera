-- Permitir teléfono nulo para turnos creados por admin
ALTER TABLE appointments
ALTER COLUMN patient_phone DROP NOT NULL;
