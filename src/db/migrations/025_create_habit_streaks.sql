-- Per-habit and overall daily streaks ("don't break the chain", mechanized).
-- One row per (user, habit_type_id); the overall streak is the row where
-- habit_type_id IS NULL. last_logged_day is the local calendar day (DATE) the
-- streak was last advanced, so a same-day duplicate log never inflates it and a
-- gap can be detected lazily on read.
CREATE TABLE IF NOT EXISTS habit_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_type_id UUID REFERENCES habit_types(id) ON DELETE CASCADE,
  current_count INTEGER NOT NULL DEFAULT 0,
  longest_count INTEGER NOT NULL DEFAULT 0,
  last_logged_day DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One streak row per habit-type, and one overall row (habit_type_id IS NULL).
-- Two partial unique indexes because NULLs are not deduplicated by a plain UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_habit_streaks_habit
  ON habit_streaks(user_id, habit_type_id) WHERE habit_type_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_habit_streaks_overall
  ON habit_streaks(user_id) WHERE habit_type_id IS NULL;

-- ── Best-effort backfill from recent completed-mission history ────────────────
-- A conservative warm start so existing users do not begin from zero: seed each
-- habit-type's last_logged_day from its most recent completion, with current=1
-- and longest = the count of distinct days it was ever completed (an upper-bound
-- approximation). Live tracking from the next completion refines/advances it; if
-- the last completion is already stale, the first read lazily resets current→0.
INSERT INTO habit_streaks (user_id, habit_type_id, current_count, longest_count, last_logged_day)
SELECT
  user_id,
  habit_type_id,
  1,
  COUNT(DISTINCT (completed_at AT TIME ZONE 'UTC')::date),
  MAX((completed_at AT TIME ZONE 'UTC')::date)
FROM missions
WHERE status = 'completed' AND completed_at IS NOT NULL AND habit_type_id IS NOT NULL
GROUP BY user_id, habit_type_id
ON CONFLICT DO NOTHING;

-- Overall streak: same conservative warm start across all completed missions.
INSERT INTO habit_streaks (user_id, habit_type_id, current_count, longest_count, last_logged_day)
SELECT
  user_id,
  NULL,
  1,
  COUNT(DISTINCT (completed_at AT TIME ZONE 'UTC')::date),
  MAX((completed_at AT TIME ZONE 'UTC')::date)
FROM missions
WHERE status = 'completed' AND completed_at IS NOT NULL
GROUP BY user_id
ON CONFLICT DO NOTHING;
