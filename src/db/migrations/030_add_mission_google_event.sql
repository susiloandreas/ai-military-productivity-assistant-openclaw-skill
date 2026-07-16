-- Link a mission to the Google Calendar event it was mirrored to, so the event
-- can be updated later (e.g. ended early with a reason when the mission is
-- extended into a new session). Both NULL for missions created before this / when
-- Google isn't connected.
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
