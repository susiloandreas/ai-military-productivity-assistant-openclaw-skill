## Context

Goals link to `habit_category_id` (NOT NULL) and are auto-advanced from both mission
completion and habit logs via `getActiveByCategory`. There is no per-habit goal and, in
fact, no goal-creation command at all — `GoalRepository.create` had no production caller.

## Goals / Non-Goals

**Goals:**
- Let each habit type carry its own goal that advances when the habit is logged.
- Keep existing category-level goals working unchanged (backward compatible).
- Provide a simple way to create a habit goal.

**Non-Goals:**
- Reworking the milestone model (reuse the existing final-exam milestone for completion).
- Advancing habit-type goals from mission completion (missions carry a category, not a type).
- Multiple concurrent active goals per habit type, or non-duration targets.

## Decisions

- **Additive `habit_type_id` (nullable) on `goals`.** A goal is either a category aggregate
  (`habit_type_id IS NULL`, existing behavior) or tied to one habit type. This avoids a
  breaking migration and keeps the category goal as a meaningful "whole category" total.
- **Category lookup excludes type-linked goals.** `getActiveByCategory` now filters
  `habit_type_id IS NULL`, so a habit-type goal is never also picked up as the category goal
  — preventing double-advance. Logging advances the habit-type goal and the category goal
  separately; they are distinct goals (e.g. "running" vs "all exercise").
- **Reuse milestone-based completion.** `createHabitGoal` adds a single final-exam milestone
  at the target; `logProgress` already unlocks milestones and marks the goal achieved when a
  final-exam milestone is reached. Target is parsed as a duration (e.g. `50h` → 3000 min),
  consistent with `/habit log`.
- **Goal creation lives under `/habit goal`.** Users think of this as "the habit's goal", and
  `HabitService` already has `GoalService` injected, so `setHabitGoal` delegates without new
  command wiring.

## Risks / Trade-offs

- **Two goals advanced per log** when both a type goal and a category goal exist — intended
  (a run counts toward both the running goal and the exercise goal), but worth documenting.
- **Targets are in minutes only.** Count-based goals (e.g. "run 50 times") are out of scope;
  the system tracks duration like the rest of the habit data.
- **No `/habit goal remove`/pause yet** — schedules/goals can currently only be created.
