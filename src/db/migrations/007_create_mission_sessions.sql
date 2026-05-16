CREATE TABLE IF NOT EXISTS mission_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  session_type VARCHAR(20) NOT NULL DEFAULT 'work'
    CHECK (session_type IN ('work', 'pause'))
);
