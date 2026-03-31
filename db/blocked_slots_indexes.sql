-- Crear indices unicos parciales para evitar duplicados activos
CREATE UNIQUE INDEX IF NOT EXISTS ux_blocked_slots_full_day_active
ON blocked_slots (blocked_date)
WHERE is_active = true AND start_time IS NULL AND end_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_blocked_slots_time_active
ON blocked_slots (blocked_date, start_time, end_time)
WHERE is_active = true AND start_time IS NOT NULL AND end_time IS NOT NULL;
