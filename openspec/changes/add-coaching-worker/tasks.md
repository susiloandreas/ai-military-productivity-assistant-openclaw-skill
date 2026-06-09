## 1. Gemini text client

- [x] 1.1 Add `generateText(prompt, opts)` in `src/utils/gemini.ts` using Node `https`, POSTing to the Generative Language API (`gemini-2.5-flash` default, `GEMINI_MODEL` / opts override)
- [x] 1.2 Reject when `GEMINI_API_KEY` is unset, on non-2xx, on empty candidates, and on a 30s timeout; resolve the joined candidate text otherwise
- [x] 1.3 Exclude `src/utils/gemini.ts` from Jest coverage (network edge)

## 2. Notification de-dup log

- [x] 2.1 Add migration `024_create_notification_log.sql` (user_id, kind, dedup_key, sent_at; `UNIQUE (user_id, dedup_key)`; index on `(user_id, sent_at DESC)`)
- [x] 2.2 Add `NotificationRepository.claim` (atomic `INSERT ... ON CONFLICT DO NOTHING`, returns whether this caller won), `sentWithinMinutes`, and `record`

## 3. Coaching context + prompt (pure)

- [x] 3.1 Add `src/schedulers/coachingContext.ts`: `COACHING_HOURS` (7,13,23), `slotForHour`, `nextRunDelayMs`, `isNearCoachingSlot`, `coachingDedupKey`
- [x] 3.2 Add `buildCoachingContext` (active/held/today-completed/week-count/due habits/yesterday) and `contextSummary`
- [x] 3.3 Add `selectYesterdayHabits` (scheduled-vs-logged for yesterday's weekday) for the morning review
- [x] 3.4 Add `buildCoachingPrompt` (general slot prompt + morning loss-aversion variant) and `fallbackCoaching` (slot-specific static copy, grounded morning fallback)
- [x] 3.5 Unit-test scheduling, dedup key, context/summary, both prompt variants, and the fallback

## 4. Coaching worker

- [x] 4.1 Add `src/schedulers/CoachingWorker.ts` that sleeps to the next slot via `nextRunDelayMs`, then runs and recomputes in a loop
- [x] 4.2 Claim the slot/day dedup key before sending; skip on a lost claim
- [x] 4.3 Fetch state, build context (morning also loads yesterday's logged habits), call Gemini, fall back to static copy on any error, deliver via `sendTelegramMessage`
- [x] 4.4 Catch and log per-run errors so the loop continues; exit non-zero on fatal startup error

## 5. Idle-reminder coordination

- [x] 5.1 Add `MissionRepository.getHabitTypeIdsLoggedBetween(user, start, end)` for the morning "logged yesterday" review
- [x] 5.2 In `IdleReminderWorker`, return early when `isNearCoachingSlot(now)` so no nudge stacks on a coaching slot
- [x] 5.3 Add `buildHeldMissionReminder` and a held-mission branch that reminds at most once / 2h (`sentWithinMinutes`/`record`, kind `held`); send at most one proactive notification per tick
- [x] 5.4 Record the idle nudge in `notification_log` (kind `idle`)
- [x] 5.5 Unit-test `buildHeldMissionReminder` (null when empty; lists held missions with a resume/cancel nudge)

## 6. Process wiring & docs

- [x] 6.1 Add `start:coaching` / `dev:coaching` npm scripts
- [x] 6.2 Add a `coaching` service to `docker-compose.yml`
- [x] 6.3 Document the coaching worker + `GEMINI_API_KEY` / `GEMINI_MODEL` in README and `.env.example`

## 7. Follow-ups (not yet done)

- [ ] 7.1 Integration-test the worker's claim → generate → fallback → deliver flow with mocked repos, Gemini, and Telegram
- [ ] 7.2 Add quiet-hours / per-user support before generalizing beyond `DEFAULT_USER_ID`
