-- De-duplication log for proactive outbound notifications (coaching, etc.).
-- A UNIQUE dedup_key guarantees a given notification (e.g. a coaching slot on a
-- given day) is sent at most once, even across worker restarts.
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  dedup_key VARCHAR(120) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent
  ON notification_log(user_id, sent_at DESC);
