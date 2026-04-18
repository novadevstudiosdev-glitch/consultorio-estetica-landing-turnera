-- Permitir email nulo para turnos creados por admin
ALTER TABLE appointments
ALTER COLUMN patient_email DROP NOT NULL;
