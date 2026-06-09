## Context

Inbound Telegram chat is classified by a deterministic, rule-based parser (`parseIntent`) into
mission intents; the listener dispatches each to a service and replies with copy from
`telegramReplies.ts`. Ambiguous short queries (`status`, `misi`) are matched against the
*whole* message so they don't swallow a real mission ("misi coding 1h"). The two new commands
follow the same pattern.

## Goals / Non-Goals

**Goals:**
- Let the user discover commands without leaving Telegram.
- Show the day's scheduled habits and their status on demand.
- Keep the status computation pure and unit-testable.
- Reuse existing data access — no new repository methods.

**Non-Goals:**
- A full interactive menu / inline keyboard (plain text reply only).
- Editing or logging habits from these commands (read-only).
- Per-user support beyond `DEFAULT_USER_ID`.
- Documenting the pre-existing mission verbs as formal requirements (out of scope here).

## Decisions

- **Whole-message triggers, like `status`.** `help` and `habits` are matched only when the
  entire message (after `normalize` strips a leading slash and trims punctuation) equals a
  trigger phrase. This mirrors `STATUS_PHRASES` and guarantees a mission such as
  "mulai habit reading 30m" still routes to `start`, never to `habits`.
- **Static help copy.** `replyHelp()` is a fixed list (no RNG) — discovery copy should be
  stable and complete, not varied. Each line pairs a command with a natural-language example,
  reinforcing that the bot takes plain language, not rigid syntax.
- **Pure `summarizeTodayHabits` + thin formatter.** The status logic (done / missed / due /
  upcoming) lives in a pure function taking `schedules`, the logged-type set, and `now`; the
  formatter just renders icons + labels. This keeps the time/grace-window logic testable
  without a DB and consistent with how the idle reminder selects due/missed habits.
- **Status taxonomy.** A today-scheduled habit is `done` if its type is in the logged-today
  set; otherwise `upcoming` before its time, `due` inside the grace window
  (`expected_at … expected_at + grace_minutes`), and `missed` once the window has closed —
  the same window semantics as the idle reminder. Items are sorted by scheduled time.
- **Reuse existing data access.** The habits branch fetches `getActiveSchedules` and
  `getHabitTypeIdsLoggedSince(startOfToday)` — already used by the idle reminder and coaching
  worker — so no new repository methods are introduced.
- **Local timezone.** Today's weekday, "now", and "logged today" are read in the process's
  local timezone, consistent with the other schedulers; `TZ` must be set.

## Risks / Trade-offs

- **Trigger collisions** — broad words like `habit` / `jadwal` are whole-message only, so they
  can't hijack a longer mission message; the trade-off is that a bare "habit" is interpreted
  as the query, which is the intended behavior.
- **Help drift** — `replyHelp()` is hand-maintained, so a new command must be added to it
  manually; acceptable for a small, stable command set.
