CREATE TABLE IF NOT EXISTS discipline_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  mission_consistency INTEGER,
  sleep_consistency INTEGER,
  focus_duration INTEGER,
  estimation_accuracy INTEGER,
  completion_rate INTEGER,
  wake_consistency INTEGER,
  habit_adherence INTEGER,
  goal_adherence INTEGER,
  distraction_frequency INTEGER,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discipline_user_date ON discipline_scores(user_id, calculated_at);
