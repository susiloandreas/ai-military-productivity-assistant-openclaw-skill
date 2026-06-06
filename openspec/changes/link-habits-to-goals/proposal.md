## Why

Goals can currently only be attached to a habit *category* (e.g. "exercise"), so a
specific habit like running cannot have its own goal. Users want each habit to carry a
goal that advances automatically as they log that habit — "do running, progress the
running goal."

## What Changes

- Allow a goal to target a specific habit type (e.g. a "running" goal), via a new nullable
  `habit_type_id` on `goals`. A goal with `habit_type_id = NULL` remains a category-level
  (aggregate) goal, exactly as before.
- When a habit is logged, advance the goal tied to that specific habit type **in addition
  to** the category-level goal (each is a distinct goal). Category lookup now only matches
  aggregate goals (`habit_type_id IS NULL`) so a habit-type goal is not advanced twice.
- Add `/habit goal set <category> <type> <target> [--deadline YYYY-MM-DD]` to create a
  habit-linked goal with a single final-exam milestone at the target (parsed as a duration).
- Show the habit name alongside the category in `/status goals` for type-linked goals.

## Capabilities

### New Capabilities
- `habit-goal-link`: Goals tied to a specific habit type, created via `/habit goal set`,
  auto-advanced when that habit is logged, and shown in goal status.

### Modified Capabilities
<!-- None — the existing goal/habit specs are not yet captured in openspec/specs. -->

## Impact

- New migration `019_add_habit_type_to_goals.sql`; `Goal.habit_type_id` added to types.
- `GoalRepository`: `create` accepts `habitTypeId`; `getActiveByCategory` scoped to
  aggregate goals; new `getActiveByHabitType`. `HabitRepository.getHabitTypeById` added.
- `GoalService.createHabitGoal` + `getGoalStatus` exposes `habitTypeName`.
- `HabitService.logRetroactive` advances the habit-type goal; `HabitLogResult` gains
  `habitGoalProgress`. New `HabitService.setHabitGoal`.
- `/habit goal` command branch; `/status goals` label shows the habit type.
- Backward compatible: existing category goals are unaffected.
