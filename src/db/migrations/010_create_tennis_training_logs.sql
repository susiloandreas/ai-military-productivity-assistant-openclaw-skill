CREATE TABLE IF NOT EXISTS tennis_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_type VARCHAR(50) NOT NULL
    CHECK (session_type IN ('serve', 'footwork', 'rally', 'endurance', 'match', 'other')),
  duration_minutes INTEGER NOT NULL,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tennis_user_date ON tennis_training_logs(user_id, logged_at);
