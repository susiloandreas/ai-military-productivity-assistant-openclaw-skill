-- Make the goal's hour duration target a first-class field. Until now it was
-- only implicit in the final-exam milestone's minutes; this stores the hours the
-- goal must accumulate to be achieved.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS target_hours NUMERIC;

-- Backfill existing goals from their final-exam milestone (minutes → hours).
UPDATE goals g
SET target_hours = m.target_value / 60.0
FROM milestones m
WHERE m.goal_id = g.id AND m.is_final_exam = TRUE AND g.target_hours IS NULL;
