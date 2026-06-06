## Why

IronClaw enforces military discipline, but the system is blind when the user simply
stops working — if no mission is started, nothing prompts them back to action. We need
a proactive nudge that detects idleness (no active mission) and demands the user declare
what they are doing, closing the gap between "no mission" and "accountability".

## What Changes

- Add a standalone `IdleReminderWorker` scheduler process that polls for an active mission
  on a fixed interval (15 minutes).
- When no mission is active, send a military-style reminder directly to Telegram asking
  the user to declare their current activity.
- Add a `habit_schedules` table so habits can be expected at a set time on set weekdays
  (e.g. running at 06:00 on Mon/Wed/Fri), with a grace window. Manage via
  `/habit schedule add` and `/habit schedule list`.
- When the user is idle, escalate the reminder to a loss-aversion message that names any
  scheduled habit that is currently DUE (inside its grace window) or MISSED (window closed)
  today and not yet logged, instead of the generic prompt.
- Add a `sendTelegramMessage` utility (`src/utils/telegram.ts`) that posts HTML messages
  to the Telegram Bot API. This is the one path that bypasses OpenClaw and talks to
  Telegram directly.
- Add `worker` process to the `Procfile` and `start:idle-reminder` / `dev:idle-reminder`
  npm scripts so the worker runs as its own deployable process.
- Require `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` environment variables.

## Capabilities

### New Capabilities
- `idle-reminder`: Periodic detection of an idle state (no active mission) and direct
  Telegram delivery of a reminder prompting the user to declare their next mission,
  escalating to a loss-aversion message when a scheduled habit is due or missed.
- `habit-schedule`: Expected habits at a set time on set weekdays with a grace window,
  created and listed via the `/habit schedule` command.

### Modified Capabilities
<!-- None — no existing spec requirements change. -->

## Impact

- New code: `src/schedulers/IdleReminderWorker.ts`, `src/schedulers/idleReminderMessages.ts`,
  `src/utils/telegram.ts`, `src/utils/schedule.ts`.
- New migration `018_create_habit_schedules.sql`; new `HabitSchedule` /
  `HabitScheduleWithNames` types; new `HabitRepository` + `HabitService` schedule methods;
  new `/habit schedule` command branch.
- Reuses `MissionRepository.getActive` and the `DEFAULT_USER_ID` constant.
- New runtime process declared in `Procfile` (`worker:`) and `package.json` scripts.
- New environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Time-of-day windows are evaluated in the worker process's local timezone — set `TZ`
  to the user's zone (e.g. `Asia/Jakarta`) for correct "morning" detection.
- Outbound dependency on `api.telegram.org` (direct, not via OpenClaw).
