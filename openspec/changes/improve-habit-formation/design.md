## Context

IronClaw already tracks scheduled habits (`habit_schedules` with `expected_at` + grace windows), logs every activity as a mission, computes a 9-factor discipline score, and sends three daily Gemini coaching briefs plus idle/ETA reminders. The review found the behavioral loop is incomplete: lots of cueing and loss-aversion, but no persisted streak, a binary `failed` outcome, and unbounded nudge volume. The existing code is already well-factored for this work — pure builders (`coachingContext.ts`, `idleReminderMessages.ts`) are split from worker wiring, and AI follow-ups (`composeCompletionCheer`, `composeNextStep`) wrap Gemini with static fallbacks. This change extends those seams rather than introducing new patterns.

## Goals / Non-Goals

**Goals:**
- Persist and surface real per-habit and overall daily streaks.
- Turn a miss into a recoverable event with a minimum-viable path and "never miss twice" escalation.
- Shift the default copy toward competence feedback; gate loss-aversion to inflection points.
- Make the completion reward escalate with streak length.

**Non-Goals:**
- No change to the discipline-score formula or weights.
- No new gamification economy (points/XP/badges) beyond streaks.
- No change to the rule-based mission parser or command surface.
- No move of Telegram delivery off the existing direct/OpenClaw paths.
- No change to reminder cadence or volume — the idle/ETA reminder behavior stays exactly as it is today (no notification budget or suppression).

## Decisions

**1. Streak granularity = per habit-type per day, plus one overall.**
A streak increments at most once per local day per habit-type (logging the same habit twice in a day does not inflate it). A habit's streak breaks when a *scheduled* day for that habit passes with no log (evaluated lazily on read and on the daily debrief, so we don't need a separate cron to "expire" streaks). The overall streak counts consecutive local days with ≥1 completed mission. Rationale: matches how users perceive "don't break the chain"; lazy break-on-read avoids a new scheduled job and is timezone-correct via `TZ`.
- *Alternative considered:* event-sourced recomputation from mission history on every read — correct but O(history) and redundant; we instead store `current`, `longest`, `last_logged_day` and recompute only the gap since `last_logged_day`.

**2. New `habit_streaks` table + `StreakRepository` + `StreakService`.**
One row per (user, habit_type_id) and a sentinel row for the overall streak (habit_type_id NULL). Columns: `current_count`, `longest_count`, `last_logged_day` (DATE, local). `StreakService.recordCompletion()` is called from `MissionService` completion/resolution; `StreakService.getSnapshot()` is a pure-ish read that applies any pending break before returning. Rationale: mirrors one-repo-per-domain convention.

**3. Recovery is a reframing + state, not a new mission status enum value churn.**
Keep DB statuses, but the *presentation* layer maps a missed/expired scheduled habit to "missed (recoverable)". `miss-recovery` logic is a pure function over (consecutiveMisses, habit) that decides: first miss → gentle recovery offer + 2-minute minimum; second consecutive miss → escalate (this is the inflection point where loss-aversion is allowed). Rationale: avoids a risky migration of the status enum and keeps the change reversible at the copy layer.
- *Alternative considered:* renaming `failed` → `missed` in the enum — rejected as a breaking data change for cosmetic gain.

**4. Tone is gated by a single pure predicate `shouldUseLossAversion(ctx)`.**
Coaching and reminder builders ask this predicate; it returns true only at inflection points (streak ≥ N about to break today, ≥2 consecutive misses, or the nightly debrief). Otherwise builders pick from competence/mastery copy pools. The Gemini prompts get a `tone` directive ("competence" | "loss_aversion") so AI output follows the same gate. Rationale: one source of truth for the 60/40 balance; testable in isolation.

**5. Escalating reward = tiering the existing cheer.**
`composeCompletionCheer` already takes the `MissionCompleteResult`; add the streak snapshot and a tier (e.g. 1, 3, 7, 14, 30+) that selects escalating celebration in both the Gemini prompt and the static fallback. No new module.

## Risks / Trade-offs

- **Lazy streak break correctness** → Mitigation: compute the break purely from `last_logged_day`, the habit's `days_of_week`, and `now` in `TZ`; unit-test across DST/week boundaries. The nightly debrief also reconciles so drift can't accumulate.
- **Tone rebalance softens the product's signature edge** → Mitigation: keep military voice; change *valence* (competence vs fear), not *intensity*. Loss-aversion still fires hard at real inflection points.
- **Backfill of streaks for existing history** → Mitigation: migration seeds `last_logged_day`/counts from recent mission history (best-effort); if absent, streaks simply start from the next completion. Acceptable cold start.
- **Double-counting on retroactive logs** → Mitigation: the once-per-day-per-type guard keyed on local day handles live and retroactive entries uniformly.
