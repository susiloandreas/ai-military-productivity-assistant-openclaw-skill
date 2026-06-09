## Why

IronClaw nudges the user only reactively — when they go idle or miss a scheduled habit.
There is no proactive, time-boxed coaching that reflects on the user's *whole* state
(missions done, momentum, habits) and deliberately fires up motivation while invoking
loss aversion. We want a brief, AI-generated coaching message at fixed points in the day
that grounds itself in the user's real data, so the discipline system also *inspires*,
not just punishes.

## What Changes

- Add a standalone `CoachingWorker` scheduler process that fires three times a day at
  fixed local hours — **07:00 (pagi), 13:00 (siang), 23:00 (malam)** — generating a brief
  Indonesian military-style coaching message via **Google Gemini**, grounded in the user's
  live state (active/held missions, today's completions, 7-day momentum, scheduled habits
  due or missed). The morning slot is a **loss-aversion review of yesterday's habits**.
- Add a minimal, dependency-free Gemini text client (`src/utils/gemini.ts`) using Node
  `https`, mirroring `src/utils/telegram.ts`, isolated behind `generateText` so the LLM
  provider can be swapped without touching callers. Falls back to a static slot-specific
  message when `GEMINI_API_KEY` is unset or the API fails, so a nudge always lands.
- Add a `notification_log` table + `NotificationRepository` to de-duplicate proactive
  outbound notifications. The coaching worker atomically **claims** a per-day/per-slot key
  so a restart or double-fire never sends a slot twice.
- Make the `IdleReminderWorker` **step aside** near a coaching slot (±15 min) so a nudge
  never stacks a second notification on top of the scheduled coaching message.
- Add **held-mission reminders** to the `IdleReminderWorker`: when missions are on hold,
  send a rate-limited (≤ once / 2h, via `notification_log`) loss-aversion nudge to resume
  or cancel them. At most one proactive notification is sent per tick.
- Add `MissionRepository.getHabitTypeIdsLoggedBetween` to support the morning slot's
  "logged yesterday" review.
- Add `coaching` process wiring: `start:coaching` / `dev:coaching` npm scripts, a
  `coaching` service in `docker-compose.yml`, README section, and `GEMINI_API_KEY` /
  `GEMINI_MODEL` in `.env.example`.

## Capabilities

### New Capabilities
- `coaching`: Scheduled, Gemini-generated coaching delivered at three fixed daily slots,
  grounded in the user's mission/habit state, with a loss-aversion morning review and a
  static fallback when the LLM is unavailable; de-duplicated per slot/day.
- `notification-log`: A persisted de-duplication log for proactive outbound notifications,
  supporting an atomic per-key claim and a recent-send lookup window.

### Modified Capabilities
- `idle-reminder`: Steps aside near coaching slots, gains held-mission reminders, and sends
  at most one proactive notification per tick.

## Impact

- New code: `src/schedulers/CoachingWorker.ts`, `src/schedulers/coachingContext.ts`,
  `src/utils/gemini.ts`, `src/repositories/NotificationRepository.ts`,
  `src/utils/seedGoals.ts` (goal seed used to populate coaching context — see also the
  goal-hour-targets change).
- New migration `024_create_notification_log.sql`; new `MissionRepository`
  `getHabitTypeIdsLoggedBetween`; modified `IdleReminderWorker` and `idleReminderMessages`
  (`buildHeldMissionReminder`).
- Reuses `MissionRepository` (`getActive`, `getHeld`, `getRecentCompleted`,
  `getHabitTypeIdsLoggedSince`), `HabitRepository.getActiveSchedules`, `sendTelegramMessage`,
  `selectDueHabits`, and the `DEFAULT_USER_ID` constant.
- New runtime process declared in `docker-compose.yml` (`coaching`) and `package.json`
  scripts. The coaching prompt/context (`coachingContext.ts`) is pure and unit-tested.
- New environment variables: `GEMINI_API_KEY`, optional `GEMINI_MODEL`
  (default `gemini-2.5-flash`).
- Slot times are evaluated in the worker process's local timezone — `TZ` must be set
  (e.g. `Asia/Jakarta`) for correct "pagi/siang/malam" detection.
- Outbound dependency on `generativelanguage.googleapis.com` (direct, not via OpenClaw);
  reuses the direct-to-Telegram delivery path.
