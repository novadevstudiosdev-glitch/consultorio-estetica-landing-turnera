-- Limpieza unica de duplicados activos (mantiene el mas reciente)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY blocked_date, start_time, end_time
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM blocked_slots
  WHERE is_active = true
    AND (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL)
    )
)
UPDATE blocked_slots
SET is_active = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
