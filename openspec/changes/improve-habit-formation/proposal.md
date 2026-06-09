## Why

A product review against habit-science principles (Fogg Behavior Model, Clear's *Atomic Habits* four laws, Gollwitzer implementation intentions, self-determination theory) found IronClaw is strong on **cue + self-monitoring** but lopsided toward **fear/loss-aversion** with almost no **reward**, no mechanized **streak**, and a **binary pass/fail** model that shames partial progress. Chronic shame drives users to mute or abandon the assistant — the opposite of habit formation. This change rebalances the system toward the mechanics that actually make habits stick.

## What Changes

- **Mechanize the "chain"**: persist per-habit and overall streaks (current + longest) and surface them in completion replies, the morning brief, and reminders. The "rantai disiplin" metaphor becomes real tracked state.
- **Replace binary failure with a recovery path**: a missed/expired mission is reframed `failed` → **missed (recoverable)**. On a miss the bot offers a 2-minute *minimum viable* version of the habit and protects "never miss twice" (a second consecutive miss escalates; a single miss does not shame).
- **Rebalance coaching/reminder tone ~60/40 toward competence/mastery**: lead with progress and capability feedback (streaks up, score up, longer focus blocks); reserve loss-aversion copy for genuine inflection points (a streak about to break, repeated misses) instead of every idle tick.
- **Escalating completion reward**: the existing AI completion cheer scales its intensity/celebration with the current streak length, so the satisfying signal grows as the chain grows.

Reminders keep their existing cadence and behavior (no notification-budget changes in this change).

## Capabilities

### New Capabilities
- `habit-streaks`: Track and surface per-habit and overall daily streaks (current + longest), updated on completion and broken on a missed scheduled day.
- `miss-recovery`: Reframe a missed/expired scheduled habit as recoverable, offer a minimum-viable (2-minute) version, and apply "never miss twice" escalation rather than blanket shame.
- `coaching-tone-balance`: Bias coaching and reminder copy toward competence/mastery feedback, gating loss-aversion language to genuine inflection points.
- `completion-reward`: Make the moment-of-completion reward escalate with streak length to strengthen the habit loop.

### Modified Capabilities
<!-- No pre-existing specs in openspec/specs/; all behavior here is introduced as new capabilities. -->

## Impact

- **New DB**: a `habit_streaks` table (per user + habit-type current/longest/last-logged-day) plus an overall streak row. New migration(s) under `src/db/migrations/`.
- **New repository**: `StreakRepository`.
- **Services**: `MissionService` completion/resolution paths update streaks and emit recovery state; a new `StreakService`; `DisciplineScoreService` unaffected but streaks may feed the brief.
- **Schedulers / copy**: `composeCompletionCheer` (escalating reward), `composeNextStep`/`telegramReplies` (recovery framing), `coachingContext`/`composeCoaching` (tone balance + streak surfacing), `idleReminderMessages` (recovery framing + competence copy). Reminder cadence/worker behavior is unchanged.
- **Telegram**: completion, expiry-resolution, and idle messages change wording; morning brief gains a streak block.
- **Tests**: new Jest suites for streak computation, recovery state machine, and tone gating (all pure-function cores kept testable, mirroring existing `coachingContext`/`idleReminderMessages` split).
