-- Scheduled habits: "running every weekday morning at 06:00".
-- Drives the idle reminder's habit loss-aversion nudge.
CREATE TABLE IF NOT EXISTS habit_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_type_id UUID NOT NULL REFERENCES habit_types(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expected_at TIME NOT NULL,                                   -- e.g. '06:00'
  grace_minutes INTEGER NOT NULL DEFAULT 90,                   -- window after expected_at
  days_of_week SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',  -- 0=Sunday .. 6=Saturday
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habit_schedules_user_active
  ON habit_schedules(user_id) WHERE active;
