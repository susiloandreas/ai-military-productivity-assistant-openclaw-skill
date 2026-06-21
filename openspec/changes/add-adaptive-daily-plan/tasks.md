## 1. Data layer — plan_blocks

- [x] 1.1 Add migration creating `plan_blocks` (user_id, plan_date, habit_type_id NULL, title, start_time, duration_minutes, hardness CHECK('hard','soft'), status CHECK('planned','done','skipped','moved','proposed'), source_schedule_id NULL, completed_mission_id NULL, timestamps)
- [x] 1.2 Add `UNIQUE(user_id, plan_date, source_schedule_id)` for idempotent materialization dedup, plus an index on (user_id, plan_date)
- [x] 1.3 Add `PlanBlock` interface and `PlanBlockStatus` / `PlanBlockHardness` unions to `src/types`
- [x] 1.4 Add `PlanRepository` (get today's blocks, bulk-insert materialized blocks with `ON CONFLICT DO NOTHING`, update one block, mark done with mission id)

## 2. Plan materialization & view (daily-plan)

- [x] 2.1 `PlanService.getTodayPlan(userId, now)` — lazy-materialize from active `habit_schedules` matching today's weekday on first read, idempotent on repeat reads
- [x] 2.2 Use local-calendar-day scoping (reuse the timezone approach used by `habit_streaks`) so a new day re-derives from the template
- [x] 2.3 `/plan` command parser in `src/commands/` rendering blocks in start-time order with title/time/duration/status, and an empty-plan message
- [x] 2.4 Unit-test materialization (one block per matching schedule), idempotency, weekday/active filtering, new-day-fresh, and template-left-unchanged after edits

## 3. On-the-fly editing (plan-editing)

- [x] 3.1 Extend the typo-tolerant trigger matcher with move / skip / add / snooze verbs ("geser", "skip", "tambah", "tunda"), preserving the existing fuzzy Indonesian behavior
- [x] 3.2 `PlanService.moveBlock` (new start_time, status `moved`) and `snoozeBlock` (bump start_time by offset)
- [x] 3.3 `PlanService.skipBlock` — status `skipped`; ensure it is excluded from miss detection
- [x] 3.4 `PlanService.addAdhoc` — typed activity upserts a habit-type via the existing flow; one-off activity stored with NULL habit-type and free-text title
- [x] 3.5 `PlanService.markDone(mission)` — bind the completing mission to its in-window block; call it from the `MissionService` completion path
- [x] 3.6 Unit-test each verb, skip≠miss, done-binding within window, two-same-type-blocks behavior, and that a `done` block is not silently reopened

## 4. Plan-aware reminders, coaching & scoring (plan-aware-reminders)

- [x] 4.1 Repoint `idleReminderMessages` and `coachingContext` from `habitRepo.getActiveSchedules` to `PlanService.getTodayPlan`
- [x] 4.2 Gate nudges by status: `planned` + window-closed + unlogged → eligible; `done`/`skipped`/`proposed` → never; `moved` → evaluate at the new time
- [x] 4.3 Expose per-day planned-vs-actual outcomes (done / missed / skipped) for the discipline-score input
- [x] 4.4 Parity test: a user who never edits the plan receives reminders identical to the prior `getActiveSchedules` path
- [x] 4.5 Unit-test nudge gating per status, moved-time evaluation, and distinct scoring outcomes

## 5. AI draft in the morning brief — propose-&-confirm (ai-plan-assist)

- [x] 5.1 `BriefingService` proposes an ordered plan from template + active goals (and how far behind) + already-logged + any stated constraint, written as `status='proposed'` blocks
- [x] 5.2 Ensure reminders and scoring ignore `proposed` blocks (covered by 4.2; add a guard test)
- [x] 5.3 Accept flow — promote `proposed` → `planned`; reject flow — delete the proposed blocks; date-scope so stale proposals never carry to a new day
- [x] 5.4 Unit-test: proposed-is-inert, accept-promotes, reject-discards

## 6. AI slippage re-plan — propose-&-confirm (ai-plan-assist)

- [x] 6.1 In `IdleReminderWorker`, when a `planned` block's window is missed, offer a re-plan (a new later time) without changing the block
- [x] 6.2 Acceptance applies the move (new start_time, status `moved`); no acceptance leaves the block untouched
- [x] 6.3 Decide and wire the acceptance affordance (inline button vs. "gas/ok" reply) per the design's open question
- [x] 6.4 Unit-test: missed→offer, unchanged-until-accept, accept-applies-move, and the no-autonomous-mutation invariant

## 7. Wiring, docs & verification

- [x] 7.1 Register `/plan` in the command router and add it to the help text
- [x] 7.2 Update README (the plan layer, NL move/skip/add/snooze, AI propose-&-confirm)
- [x] 7.3 Run `npx tsc --noEmit` and the full Jest suite; fix regressions
