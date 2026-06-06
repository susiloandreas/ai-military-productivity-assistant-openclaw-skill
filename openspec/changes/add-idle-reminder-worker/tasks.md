## 1. Telegram delivery utility

- [x] 1.1 Add `sendTelegramMessage(text)` in `src/utils/telegram.ts` using Node `https`, posting to `api.telegram.org` with `parse_mode: HTML`
- [x] 1.2 Reject when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset, and reject on non-2xx Telegram responses

## 2. Idle reminder worker

- [x] 2.1 Add `src/schedulers/IdleReminderWorker.ts` that checks `MissionRepository.getActive(DEFAULT_USER_ID)` on a 15-minute interval
- [x] 2.2 Run the check once immediately on startup, then on the interval
- [x] 2.3 Send the military-style idle reminder via `sendTelegramMessage` only when no active mission exists; log the active mission otherwise
- [x] 2.4 Catch and log per-check errors so the interval loop continues; exit non-zero on fatal startup error

## 3. Process wiring

- [x] 3.1 Add `start:idle-reminder` and `dev:idle-reminder` npm scripts in `package.json`
- [x] 3.2 Add a `worker:` process to the `Procfile`
- [x] 3.3 Document `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the README and `.env.example`

## 4. Habit schedules

- [x] 4.1 Add migration `018_create_habit_schedules.sql` (habit_type_id, expected_at TIME, grace_minutes, days_of_week, active)
- [x] 4.2 Add `HabitSchedule` / `HabitScheduleWithNames` types
- [x] 4.3 Add `HabitRepository.createSchedule`, `getActiveSchedules`, `getHabitTypeIdsLoggedSince`
- [x] 4.4 Add `HabitService.addSchedule` / `listSchedules` and a `/habit schedule add|list` command branch
- [x] 4.5 Add `src/utils/schedule.ts` (`parseTimeOfDay`, `parseDaysOfWeek`, `formatDaysOfWeek`)

## 5. Habit loss-aversion reminder

- [x] 5.1 Add `src/schedulers/idleReminderMessages.ts`: `selectDueHabits` (due vs missed, today only, unlogged, missed-first) and `buildHabitLossAversionMessage` (returns null when nothing due/missed)
- [x] 5.2 In the worker's idle branch, load active schedules + today's logged habit types and send the loss-aversion message when something is due/missed, else fall back to the generic prompt
- [x] 5.3 Unit test `selectDueHabits`, `buildHabitLossAversionMessage`, and the schedule parsers

## 6. Varied (AI-like) message wording

- [x] 6.1 Replace fixed copy with variant pools (idle nudges; loss-aversion headers/intros/closers/CTAs)
- [x] 6.2 Add an injectable `Rng` + `pick`; `randomIdleMessage` and `buildHabitLossAversionMessage` choose variants randomly (default `Math.random`)
- [x] 6.3 Worker sends a random generic nudge; unit-test variety + deterministic output with a fixed RNG

## 7. Tests

- [ ] 7.1 Unit test `sendTelegramMessage`: resolves on 2xx, rejects on missing env vars, rejects on non-2xx
- [ ] 7.2 Unit test the worker check: sends reminder when no active mission, skips when one is active (mock repositories and `sendTelegramMessage`)
