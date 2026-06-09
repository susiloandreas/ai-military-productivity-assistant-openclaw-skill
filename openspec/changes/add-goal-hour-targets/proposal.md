## Why

A goal's duration target was only implicit — buried in its final-exam milestone's `minutes`
value. Nothing on the goal itself said "this goal needs N hours". That made it awkward to read,
seed, or coach against an hour target (the coaching worker wants hours, the system tracks
minutes). We promote the hour target to a first-class goal field.

## What Changes

- Add a `target_hours` column to `goals` (migration `023`), the hours of logged duration the
  goal must accumulate to be achieved.
- Backfill `target_hours` for existing goals from their final-exam milestone
  (`target_value` minutes ÷ 60).
- Thread `targetHours` through the `Goal` type, `GoalRepository.create`, and
  `GoalService.createHabitGoal` (which passes `targetMinutes / 60`).
- Add `src/utils/seedGoals.ts` (+ `seed:goals` script) to seed category-level goals, each with
  an hour target and intermediate hour checkpoints, idempotently, backfilling progress from
  minutes already logged in the category.

## Capabilities

### New Capabilities
- `goal-hour-target`: An explicit hour-based duration target on a goal, backfilled from the
  final-exam milestone, settable on creation, and used to seed category goals.

### Modified Capabilities
<!-- None — no existing spec requirements change. -->

## Impact

- New migration `023_add_goal_target_hours.sql`; new optional `Goal.target_hours` field.
- `GoalRepository.create` and `GoalService.createHabitGoal` gain a `targetHours` parameter
  (defaults to `null`, fully backward compatible).
- New `src/utils/seedGoals.ts` and `seed:goals` npm script; `seedGoals.ts` excluded from Jest
  coverage. (The script + coverage exclusion were wired alongside the coaching worker change.)
- Progress is still tracked in minutes via milestones; `target_hours` is a readable,
  hour-denominated mirror of the final-exam target, not a second source of truth.
