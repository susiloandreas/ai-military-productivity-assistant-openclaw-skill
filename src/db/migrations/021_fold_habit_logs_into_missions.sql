-- Fold habit logging into missions. Each habit_log becomes a 'retroactive', already
-- 'completed' mission. Existing goal_progress_logs that pointed at a habit_log are
-- re-pointed at the new mission, then the habit-log source column and the habit_logs
-- table are dropped. IRREVERSIBLE.

-- Temporary carrier so we can map each migrated log to its new mission row.
ALTER TABLE missions ADD COLUMN IF NOT EXISTS legacy_habit_log_id UUID;

INSERT INTO missions (
  user_id, title, habit_category_id, habit_type_id, status, mode,
  started_at, completed_at, actual_duration_minutes, notes, created_at, legacy_habit_log_id
)
SELECT
  hl.user_id, ht.name, ht.habit_category_id, hl.habit_type_id, 'completed', 'retroactive',
  hl.logged_at, hl.logged_at, hl.duration_minutes, hl.note, hl.logged_at, hl.id
FROM habit_logs hl
JOIN habit_types ht ON ht.id = hl.habit_type_id;

UPDATE goal_progress_logs gpl
SET source_mission_id = m.id
FROM missions m
WHERE m.legacy_habit_log_id = gpl.source_habit_log_id
  AND gpl.source_habit_log_id IS NOT NULL;

ALTER TABLE goal_progress_logs DROP CONSTRAINT IF EXISTS chk_single_source;
ALTER TABLE goal_progress_logs DROP COLUMN IF EXISTS source_habit_log_id;

ALTER TABLE missions DROP COLUMN IF EXISTS legacy_habit_log_id;

DROP TABLE IF EXISTS habit_logs;
