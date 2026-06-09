## Why

The Telegram listener understands mission verbs (start / complete / abort / extend / status)
but offers no way to discover them, and no way to see the day's scheduled habits on demand.
A new user has to guess the phrasing, and there is no quick "what's left today?" view. Two
read-only query commands close that gap.

## What Changes

- Add a `help` intent to the rule-based parser (whole-message triggers: `help`, `/help`,
  `bantuan`, `menu`, `commands`, `perintah`, …) → a static `replyHelp()` listing every
  supported command with a natural-language example.
- Add a `habits` intent (whole-message triggers: `habits`, `/habits`, `kebiasaan`,
  `jadwal hari ini`, …) → `replyHabitsToday()` showing each habit scheduled for *today* with a
  status (done / missed / due / upcoming), sorted by time, with a "done / total" counter.
- Add a pure `summarizeTodayHabits(schedules, loggedTypeIds, now)` helper that tags today's
  scheduled habits by status, kept separate so it is unit-testable.
- Wire both intents into `TelegramListenerWorker`; the habits branch reuses
  `HabitRepository.getActiveSchedules` and `MissionRepository.getHabitTypeIdsLoggedSince`.

## Capabilities

### New Capabilities
- `telegram-commands`: On-demand, read-only Telegram queries — a command help/menu and a
  today's-scheduled-habits list with per-habit status.

### Modified Capabilities
<!-- None — the listener gains two branches but no existing spec requirement changes. -->

## Impact

- Parser: new `help` / `habits` members on `ParsedIntent`, plus `HELP_PHRASES` /
  `HABITS_PHRASES` whole-message trigger sets (a leading slash is already stripped by
  `normalize`, so `/help` arrives as `help`).
- Replies: new `replyHelp`, `replyHabitsToday`, and exported `summarizeTodayHabits`
  (+ `TodayHabit` / `TodayHabitStatus`) in `src/schedulers/telegramReplies.ts`.
- Listener: new `help` and `habits` cases in `TelegramListenerWorker`.
- Both commands are whole-message matches, so they never swallow a mission like
  "mulai habit reading 30m". No schema or migration changes. Unit tests added for the parser
  intents, the status helper, and both reply formatters.
