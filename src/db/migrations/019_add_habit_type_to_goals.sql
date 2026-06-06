-- Allow a goal to target a specific habit type (e.g. a "running" goal), not just
-- a habit category. NULL habit_type_id means the goal aggregates the whole category.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS habit_type_id UUID REFERENCES habit_types(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_goals_active_habit_type
  ON goals(habit_type_id) WHERE status = 'active';
