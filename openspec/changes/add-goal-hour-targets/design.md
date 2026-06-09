## Context

Goals track progress in minutes through milestones; the last milestone (`is_final_exam`) holds
the real target. Reading "how many hours is this goal?" meant reaching into that milestone.
Coaching and seeding both want to talk in hours, so the hour target deserves to live on the
goal row.

## Goals / Non-Goals

**Goals:**
- Make the hour target a readable field on the goal.
- Backfill it for existing goals without manual data work.
- Keep goal creation backward compatible.
- Provide a repeatable, idempotent way to seed category goals with hour targets.

**Non-Goals:**
- Replacing minute-based milestone tracking (minutes stay the unit of progress).
- Enforcing consistency between `target_hours` and the final-exam milestone after creation.
- Per-user goal seeding beyond `DEFAULT_USER_ID`.

## Decisions

- **`target_hours NUMERIC`, nullable.** Hours (not minutes) because that is how the user and the
  coach reason about a goal; `NUMERIC` allows fractional hours. Nullable so pre-existing rows and
  goals created without a target are valid.
- **Backfill in the migration.** The migration sets `target_hours` from each goal's final-exam
  milestone (`target_value / 60.0`) where it is still null, so existing goals are correct
  immediately with no app-side migration step.
- **Mirror, not source of truth.** Progress and achievement still derive from milestone minutes;
  `target_hours` is a denormalized, hour-denominated copy of the final-exam target for display
  and coaching. We accept it can drift if a milestone is edited later — out of scope for now.
- **`createHabitGoal` derives hours from minutes.** It already takes `targetMinutes`, so it
  passes `targetMinutes / 60` to `create` — one source, no new caller input.
- **Seeding is idempotent and backfills progress.** `seedGoals.ts` skips a category that already
  has an active goal, creates intermediate hour checkpoints plus the final-exam hour target, and
  rolls already-logged retroactive minutes in that category into goal progress so a freshly
  seeded goal reflects the week already worked.

## Risks / Trade-offs

- **Possible drift** between `target_hours` and the final-exam milestone if the milestone is
  edited without updating the field; acceptable because the milestone remains authoritative for
  progress/achievement.
- **Single-user seeding** — `seedGoals.ts` hardcodes `DEFAULT_USER_ID`, consistent with the other
  seed scripts; must be generalized before multi-user.
