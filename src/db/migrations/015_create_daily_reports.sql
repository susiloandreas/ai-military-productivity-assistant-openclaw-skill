CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  missions_completed INTEGER NOT NULL DEFAULT 0,
  missions_failed INTEGER NOT NULL DEFAULT 0,
  total_focus_minutes INTEGER NOT NULL DEFAULT 0,
  sleep_minutes INTEGER,
  discipline_score INTEGER,
  habits_logged INTEGER NOT NULL DEFAULT 0,
  goal_progress_summary JSONB,
  coaching_insights JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, report_date)
);
