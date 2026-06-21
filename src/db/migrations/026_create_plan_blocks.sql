-- Adaptive daily plan: per-day, mutable time-blocks derived from habit_schedules
-- ("standing orders → today's orders"). Blocks are materialized lazily on the
-- first read of a day (see PlanService.getTodayPlan) from the active schedules
-- whose days_of_week include that weekday; they can then be moved / skipped /
-- added / snoozed for that one day without touching the recurring template.
--
-- duration_minutes is NULLABLE: a habit_schedule defines a time + window but no
-- activity length, so a materialized block's duration is unknown until the user
-- specifies it (ad-hoc adds carry their own). The status CHECK includes
-- 'proposed' from the outset so the later AI propose-&-confirm phase needs no
-- second migration, even though the MVP never writes that value.
CREATE TABLE IF NOT EXISTS plan_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  habit_type_id UUID REFERENCES habit_types(id) ON DELETE SET NULL,  -- NULL = one-off ad-hoc block
  title TEXT NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER,                                          -- NULL = unspecified length
  hardness VARCHAR(10) NOT NULL DEFAULT 'soft' CHECK (hardness IN ('hard','soft')),
  status VARCHAR(10) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','done','skipped','moved','proposed')),
  source_schedule_id UUID REFERENCES habit_schedules(id) ON DELETE SET NULL,  -- provenance; NULL = ad-hoc
  completed_mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,       -- what satisfied it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One materialized block per (user, day, source schedule) so a concurrent double
-- read never double-inserts. Ad-hoc blocks (source_schedule_id IS NULL) are
-- exempt — a user may add several one-offs a day — hence a partial unique index,
-- mirroring the partial-unique pattern used by habit_streaks (migration 025).
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_blocks_materialized
  ON plan_blocks(user_id, plan_date, source_schedule_id)
  WHERE source_schedule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plan_blocks_user_date
  ON plan_blocks(user_id, plan_date);
