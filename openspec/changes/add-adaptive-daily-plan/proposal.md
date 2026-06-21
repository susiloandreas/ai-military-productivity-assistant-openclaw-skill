## Why

`habit_schedules` is the only scheduling layer and it is rigid: one fixed `expected_at` + `days_of_week` per habit, forever. There is no way to adapt a *single* day — move a habit later, take a deliberate rest day, drop in a one-off block — without rewriting the standing template, and the AI cannot help plan or re-plan the day. Real adherence needs orders that hold over time but bend in the field.

## What Changes

- **Split scheduling into two layers — "standing orders → today's orders".** `habit_schedules` stays as the durable recurring *template*. A new dated, mutable **day plan** of time-blocks is **materialized lazily** from the template on first read each day (the morning brief or `/plan`), then edited freely without touching the template. Tomorrow regenerates fresh.
- **On-the-fly daily edits** through the existing typo-tolerant Indonesian NLP matcher: **move** ("geser lari ke jam 5 sore"), **skip / rest day** ("skip meditasi hari ini" — a deliberate choice, not a streak-breaking miss), **add ad-hoc** ("tambah baca 30 menit jam 9 malam"), and **snooze** a due block ("tunda 30 menit").
- **A `/plan` view** of today's ordered blocks with per-block status (planned / done / skipped / moved); "done" is satisfied when a matching mission is logged in the block's window.
- **Reminders and coaching read the plan instead of raw `habit_schedules`.** Grace windows, loss-aversion, and "done if logged" carry over unchanged; a deliberately skipped block no longer nags; discipline scoring gains a new planned-and-done vs planned-and-missed signal.
- **AI plan assistance, propose-&-confirm only** (the AI never mutates the plan until the user accepts): the morning brief **drafts** an ordered day from the template + active goals + what's already logged + any stated constraint, and on a missed window the idle reminder **proposes** a re-plan ("you missed your run — move it to 17:00?") with one-tap accept.

Reminder cadence and worker scheduling are unchanged; this change only re-points what the reminders read and adds the plan layer on top.

## Capabilities

### New Capabilities
- `daily-plan`: A dated, mutable per-day plan of time-blocks, materialized lazily from `habit_schedules` for the day's weekday and viewable via `/plan`; the canonical "today's orders" record.
- `plan-editing`: On-the-fly block mutations (move, skip, add ad-hoc, snooze) parsed from natural language, the block status model (planned/done/skipped/moved), and the rule that a block is marked done by a matching logged mission.
- `plan-aware-reminders`: Idle reminders, coaching context, and discipline scoring source from the day plan instead of `habit_schedules` — respecting skips/moves and scoring planned-vs-actual — while preserving existing grace-window and loss-aversion behavior.
- `ai-plan-assist`: Propose-&-confirm AI help that drafts the ordered day in the morning brief and proposes a re-plan when a window is missed, never applying a change until the user accepts.

### Modified Capabilities
<!-- No base specs are maintained in openspec/specs/; all behavior here is introduced as new capabilities (matching the improve-habit-formation precedent). -->

## Impact

- **New DB**: a `plan_blocks` table (user_id, plan_date, habit_type_id NULL for one-off blocks, title, start_time, duration_minutes, hardness, status, source_schedule_id, completed_mission_id, timestamps) under `src/db/migrations/`. No change to `habit_schedules`.
- **New repository**: `PlanRepository` (read/materialize today's blocks, mutate a block, mark done).
- **New service**: `PlanService` — lazy materialization from `habit_schedules`, the status state machine, and the done-via-mission binding (reusing the existing type-keyed match).
- **New types**: `PlanBlock` (+ status/hardness unions) in `src/types`.
- **New command**: `/plan` parser in `src/commands/`; NL move/skip/add/snooze routed through the existing trigger matcher.
- **Schedulers / copy**: `idleReminderMessages` and `coachingContext` read the plan (skips suppressed, re-plan proposals added); `BriefingService` drafts the day; `DisciplineScore`-feeding paths gain planned-vs-actual signal. Streaks are unchanged (still per habit-type from missions).
- **Telegram**: a new `/plan` view; the brief gains a proposed-plan block; idle reminders gain an accept-to-re-plan affordance.
- **Tests**: new Jest suites for lazy materialization, the block status state machine, NL edit parsing, plan-aware reminder gating, and the propose-&-confirm flow (pure-function cores kept testable, mirroring the existing `coachingContext`/`idleReminderMessages` split).
