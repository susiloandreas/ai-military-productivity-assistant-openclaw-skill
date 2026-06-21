## Context

Today `habit_schedules` is the only scheduling layer: one fixed `expected_at` + `days_of_week` per habit-type, with a `grace_minutes` window and an `active` flag (migration 018). The idle reminder, coaching context, and the `/habit schedule` view all read it directly, and the "did the user actually do it?" check is already keyed on `habit_type_id` versus the `habit_type_id` of missions logged today (`idleReminderMessages.ts:148`, `telegramReplies.ts:325`, `coachingContext.ts:114-129`). There is no per-day representation, so a single day cannot deviate from the template, and the AI brief/coaching can describe the day but cannot shape it.

Two existing patterns make the addition cheap:
- **Lazy-on-read state.** `habit_streaks` (migration 025) detects gaps lazily on read instead of via a cron. The day plan can be materialized the same way.
- **Type-keyed done-detection.** The set-membership match above transfers unchanged once reminders read a per-day plan instead of the raw template.

This change is single-user (`DEFAULT_USER_ID`), Telegram-delivered, Indonesian-language, on the existing TS/Express/PostgreSQL/BullMQ stack.

## Goals / Non-Goals

**Goals:**
- A durable template (`habit_schedules`) plus a mutable, dated **day plan** that derives from it but can change per day without editing the template.
- On-the-fly edits (move / skip / add ad-hoc / snooze) in natural language, with **skip ≠ miss** semantics.
- Reminders, coaching, and discipline scoring sourced from the plan, preserving today's grace-window and loss-aversion behavior.
- AI that **drafts** and **re-plans** but only ever **proposes** — no mutation without explicit user acceptance.

**Non-Goals:**
- Changing reminder cadence, the BullMQ worker topology, or `habit_schedules` itself.
- Multi-user / shared plans, calendar-app sync, or recurring exceptions on the template (per-occurrence template edits are explicitly out).
- Reworking streaks (they remain per habit-type from missions) or the discipline-score formula (this only feeds it a new input).

## Decisions

### D1. Two layers (template → dated instances), not per-occurrence template edits
A new `plan_blocks` table holds concrete blocks for one `plan_date`; `habit_schedules` stays the recurring template. *Alternatives:* (a) make `habit_schedules` rows editable per occurrence — pollutes the durable template and has no clean "revert tomorrow"; (b) replace `habit_schedules` entirely with dated rows — loses the compact recurring definition and forces N rows per habit. The template→instance split gives "standing orders that bend in the field, then snap back tomorrow" for one small table.

### D2. Lazy materialization on first read, no new cron
`PlanService.getTodayPlan(userId, now)` materializes today's blocks from `habit_schedules` for the day's weekday on first access (brief or `/plan`), then returns the persisted rows on subsequent reads. *Alternative:* a morning cron worker — adds a process to the Procfile and a delivery-time dependency for a value only needed on first interaction. Lazy-on-read mirrors `habit_streaks` and keeps the worker set unchanged. Idempotency: materialization is guarded by `UNIQUE(user_id, plan_date, source_schedule_id)` so a double read never double-inserts.

### D3. `plan_blocks` shape
```
plan_blocks(
  id, user_id, plan_date DATE,
  habit_type_id UUID NULL REFERENCES habit_types,   -- NULL = one-off ad-hoc block
  title TEXT NOT NULL,                               -- label; for template blocks = habit-type name
  start_time TIME NOT NULL, duration_minutes INT NOT NULL,
  hardness  TEXT NOT NULL DEFAULT 'soft'  CHECK (hardness IN ('hard','soft')),
  status    TEXT NOT NULL DEFAULT 'planned'
            CHECK (status IN ('planned','done','skipped','moved','proposed')),
  source_schedule_id   UUID NULL REFERENCES habit_schedules,  -- provenance; NULL = ad-hoc
  completed_mission_id UUID NULL REFERENCES missions,         -- what satisfied it
  created_at, updated_at)
```
- **`habit_type_id` nullable** so a true one-off ("call mom") never pollutes `habit_types`; typed ad-hoc adds ("tambah baca…") still upsert a habit-type via the existing flow.
- **`source_schedule_id`** records template provenance (and powers the dedup unique index); ad-hoc blocks have NULL.
- **`completed_mission_id`** binds the specific mission that marked the block done — disambiguates two blocks of the same type in one day (set-membership alone cannot).
- **`status` CHECK includes `proposed` from the first migration** (forward-compat) even though the MVP never writes it; `ai-plan-assist` uses it later, avoiding a second enum migration.

### D4. Done-detection: reuse type-keyed match for MVP, bind the mission when known
The MVP marks a block `done` when a mission with the same `habit_type_id` is logged within `[start_time, start_time + grace]` — the existing match, now writing back `status='done'` and `completed_mission_id`. *Trade-off:* with two same-type blocks in a day, the first match wins until binding is explicit; acceptable for the MVP and fully resolved once `MissionService` completion calls `PlanService.markDone(missionId)` with the chosen block.

### D5. Skip is a first-class status, distinct from a miss
`skipped` is a deliberate user choice and MUST NOT count as a missed scheduled day for reminders/coaching/score; only `planned` blocks whose window has closed with no log are "missed". This is the behavioral core of "rest day without shame" and the reason coaching gets *more* accurate.

### D6. NL edits routed through the existing matcher; `/plan` for explicit view
Move/skip/add/snooze verbs ("geser", "skip", "tambah", "tunda") extend the existing typo-tolerant trigger matcher rather than a new parser, keeping the Indonesian/fuzzy behavior (commits a5479e3 / 202bd60). Each verb maps to one `PlanService` mutation. `/plan` is a thin command parser in `src/commands/` over `PlanService.getTodayPlan`.

### D7. Propose-&-confirm via a `proposed` status, accepted explicitly
AI output is written as `status='proposed'` rows (or, for a slippage move, a proposed patch surfaced on the reminder); reminders and scoring **ignore non-`planned` blocks**, so a proposal is inert until accepted. Acceptance ("gas" / "ok" / inline-button) flips `proposed`→`planned` (or applies the move); rejection deletes the proposed rows / drops the patch. *Alternative:* stateless proposals re-derived on accept — rejected because the draft inputs (logged progress, time) drift between propose and accept, so the accepted plan could differ from what was shown. Persisting the exact proposed rows guarantees "what you saw is what you get."

### D8. Single source for reminders: `PlanService.getTodayPlan`
`idleReminderMessages`/`coachingContext` switch from `habitRepo.getActiveSchedules` to the plan. When a user has schedules but the plan is empty, getTodayPlan materializes first, so behavior is unchanged for users who never edit. Local-day/timezone handling reuses the approach already used by streaks.

## Risks / Trade-offs

- **Materialization races** (two reads at once double-insert) → `UNIQUE(user_id, plan_date, source_schedule_id)` + `ON CONFLICT DO NOTHING`.
- **Stale proposals** (a `proposed` plan sits unaccepted into the next day) → proposals are date-scoped; getTodayPlan ignores prior-day `proposed` rows and a cleanup deletes them on the next materialize.
- **Reminder regression** for users who never touch the plan → covered by D8 (lazy materialize makes the plan equal the template) and a test asserting parity with the old `getActiveSchedules` output.
- **Two same-type blocks/day mis-marked** (D4) → bounded by binding `completed_mission_id` at completion; documented as a known MVP limitation in tasks.
- **Scope creep into the score formula** → this change only emits a planned-vs-actual signal; consuming it is a follow-up if the formula needs tuning.

## Migration Plan

1. Ship `plan_blocks` migration (additive; no change to `habit_schedules` or `missions` beyond a nullable FK target already present). Reversible by dropping the table.
2. Land `daily-plan` + `plan-editing` + `plan-aware-reminders` (MVP) behind the lazy-materialize read path; reminders keep working with zero plan edits.
3. Land `ai-plan-assist` (draft in brief, then slippage re-plan) using the `proposed` status already permitted by the CHECK — no further migration.
4. Rollback: dropping `plan_blocks` and reverting the reminder read path to `getActiveSchedules` restores prior behavior; `habit_schedules` data is untouched throughout.

## Open Questions

- Acceptance affordance: Telegram inline buttons vs. a natural-language "gas/ok" reply (IdleReminderWorker posts directly via `telegram.ts`, which may need callback wiring) — resolve during `ai-plan-assist`.
- Should a `skipped` hard block still feed a gentle next-day "yesterday you rested — back on it today?" nudge, or stay fully silent?
- Default `hardness` per template block: infer from `habit_schedules` (e.g., all template blocks `hard`) or always `soft` until the user marks otherwise?
