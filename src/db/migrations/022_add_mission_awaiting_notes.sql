-- When a mission's ETA expires or it is completed, the bot asks the user what
-- they did and stores the reply in notes. This flag marks a mission as waiting
-- for that free-text answer (the listener captures the next message into notes).
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS awaiting_notes BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_missions_awaiting_notes
  ON missions(user_id) WHERE awaiting_notes;
