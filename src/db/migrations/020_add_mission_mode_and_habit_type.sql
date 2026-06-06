-- Missions become the single activity record. A mission is either:
--   'live'        — the start → complete timer (existing behaviour)
--   'retroactive' — an already-finished activity logged after the fact
--                   (what the former /habit log produced)
-- habit_type_id lets a mission target a specific habit type, not just a category.
ALTER TABLE missions ADD COLUMN IF NOT EXISTS habit_type_id UUID REFERENCES habit_types(id) ON DELETE SET NULL;

ALTER TABLE missions ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'live'
  CHECK (mode IN ('live', 'retroactive'));

CREATE INDEX IF NOT EXISTS idx_missions_user_mode_completed
  ON missions(user_id, mode, completed_at);
