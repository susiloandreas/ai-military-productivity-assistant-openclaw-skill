## Context

IronClaw already runs an `EtaExpiryWorker` as a separate process driven by Redis + BullMQ.
The idle reminder, however, is time-driven rather than event-driven: it must fire on a wall
clock interval regardless of any queued job. There is no existing path for the service to
push messages to the user outside of OpenClaw's request/response flow, so a direct Telegram
delivery utility is also needed.

## Goals / Non-Goals

**Goals:**
- Detect an idle state (no active mission) and nudge the user every 15 minutes.
- Run as an independent, separately deployable process (Procfile `worker:`).
- Reuse the existing `MissionRepository` and `DEFAULT_USER_ID` rather than new data access.
- Provide a minimal, dependency-free Telegram delivery helper.

**Non-Goals:**
- Per-user idle tracking (single default user only for now).
- Configurable interval or quiet hours.
- Routing the reminder through OpenClaw.
- Persisting reminder history in the database.
- Per-schedule timezones, snooze, or de-duplicating repeat nudges within the same window.

## Decisions

- **`setInterval` polling, not BullMQ.** The reminder is a simple recurring wall-clock check
  with no job payload or retry semantics, so a plain `setInterval` (15 min) plus an immediate
  startup check is simpler than a repeatable BullMQ job and avoids Redis coupling for this worker.
- **Direct Telegram delivery via Node `https`.** `sendTelegramMessage` uses the built-in `https`
  module (no new dependency) to POST to `api.telegram.org` with `parse_mode: HTML`. This is the
  one intentional exception to the "all delivery flows through OpenClaw" rule, because the worker
  has no OpenClaw request context to reply to.
- **Mission check via `MissionRepository.getActive`.** Idleness is defined as "no active mission",
  reusing the same source of truth the rest of the system uses.
- **Errors are caught per-check.** Each check is wrapped so a transient DB/Telegram failure logs
  and the interval keeps running; only a fatal startup error exits non-zero.
- **Habit loss-aversion over a generic nudge.** Loss aversion is a stronger motivator than a
  neutral ping, so when idle the worker confronts the user with the *specific* scheduled habit(s)
  they are losing today. A new `habit_schedules` table holds expected time, grace window, and
  weekdays per habit type. A habit is DUE inside its grace window and MISSED once the window
  closes — both only if unlogged today. MISSED is listed first (strongest loss); the copy lives
  in `idleReminderMessages.ts` so it is easy to tune and unit-test. Falls back to the generic
  prompt when nothing is due/missed.
- **Exact time + grace window + per-weekday.** A schedule is `expected_at` (TIME) + `grace_minutes`
  + `days_of_week` (0=Sun..6=Sat). This is more precise than time-of-day buckets and lets routines
  differ by day (e.g. running Mon/Wed/Fri).
- **"Today" / "now" use the worker's local timezone.** Weekday and time-of-day are read via
  `Date.getDay()/getHours()`, and "logged today" is computed from local start-of-day. Time-of-day
  windows are only meaningful in the user's zone, so `TZ` must be set (e.g. `Asia/Jakarta`).
- **Varied copy via pools, no AI.** Rather than one fixed template, the message is assembled
  from pools of interchangeable variants (idle nudges; loss-aversion headers/intros/closers/CTAs)
  picked pseudo-randomly, so it reads differently each time — an "AI-like" feel without an LLM
  call (cheap, deterministic-testable, dependency-free). The RNG is injectable: production uses
  `Math.random`, tests pass a fixed function. The data-bearing habit line is kept stable.

## Risks / Trade-offs

- **No quiet hours** — the worker will nudge at any hour; acceptable for the single-user MVP,
  revisit if it becomes noisy.
- **Drift / overlap** — `setInterval` can drift and does not await the previous check; checks are
  fast and idempotent, so overlap is harmless.
- **Direct Telegram coupling** — bypassing OpenClaw means a second place that needs Telegram
  credentials; mitigated by isolating it in a single utility.
- **Single-user assumption** — hardcoded `DEFAULT_USER_ID` must be generalized before multi-user.
