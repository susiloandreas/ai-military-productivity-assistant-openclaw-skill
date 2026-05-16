CREATE TABLE IF NOT EXISTS goal_progress_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  source_mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  source_habit_log_id UUID REFERENCES habit_logs(id) ON DELETE SET NULL,
  value_delta NUMERIC NOT NULL,
  unit VARCHAR(50) NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_single_source CHECK (
    (source_mission_id IS NOT NULL AND source_habit_log_id IS NULL) OR
    (source_mission_id IS NULL AND source_habit_log_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress_logs(goal_id, logged_at);
