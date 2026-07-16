-- Google Calendar → habit sync support.
--
-- google_event_id links a habit_schedule to the Calendar event it was synced
-- from, so a later sync can update or deactivate it WITHOUT touching schedules
-- created directly in the app (those keep google_event_id NULL). The partial
-- unique index gives the sync a clean upsert target (one schedule per event).
ALTER TABLE habit_schedules
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_habit_schedules_google_event
  ON habit_schedules(user_id, google_event_id) WHERE google_event_id IS NOT NULL;

-- Which calendar holds this user's habits (the dedicated "Ironclaw Habits"
-- calendar). Remembered so we do not re-create or re-search it every sync.
ALTER TABLE google_oauth_tokens
  ADD COLUMN IF NOT EXISTS habit_calendar_id TEXT;
