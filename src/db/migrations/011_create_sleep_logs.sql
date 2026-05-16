CREATE TABLE IF NOT EXISTS sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL,
  wake_time TIME,
  sleep_quality VARCHAR(20) CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sleep_user_date ON sleep_logs(user_id, logged_at);
