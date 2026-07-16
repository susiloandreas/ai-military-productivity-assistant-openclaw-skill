-- Mirror of the user's Google Calendar events across ALL their calendars, within
-- a rolling time window (recurring series are expanded into concrete instances by
-- the sync, so a window is required). `category` is parsed from a #hashtag in the
-- event title, e.g. "Meeting a #WORK" -> category 'WORK', title 'Meeting a'.
--
-- One row per (user, calendar, event instance). The sync upserts on that key and
-- prunes rows inside the synced window whose event no longer exists in Google.
CREATE TABLE IF NOT EXISTS calendar_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id  TEXT NOT NULL,
  event_id     TEXT NOT NULL,               -- Google event id (per-instance for recurring)
  title        TEXT NOT NULL,               -- title with #hashtags stripped
  category     TEXT,                         -- uppercased tag, or NULL when untagged
  location     TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ,
  all_day      BOOLEAN NOT NULL DEFAULT FALSE,
  html_link    TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, calendar_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
  ON calendar_events(user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_category
  ON calendar_events(user_id, category) WHERE category IS NOT NULL;
