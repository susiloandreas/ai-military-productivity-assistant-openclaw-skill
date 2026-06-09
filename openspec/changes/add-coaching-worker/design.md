## Context

IronClaw already runs separate worker processes (`EtaExpiryWorker`, `IdleReminderWorker`,
`TelegramListenerWorker`) and a direct-to-Telegram delivery utility
(`src/utils/telegram.ts`). The idle reminder is *reactive* — it fires only on idleness or a
missed habit. Coaching is *scheduled*: it must fire at fixed wall-clock hours, regardless of
state, and reflect on the user's whole picture. Two new concerns follow: a way to call an LLM
without a heavy SDK, and a way to guarantee a scheduled message is sent exactly once per slot
even across restarts.

## Goals / Non-Goals

**Goals:**
- Deliver a brief, grounded coaching message three times a day (07:00 / 13:00 / 23:00 local).
- Ground every message in real data; never invent numbers.
- Always land a message — fall back to static copy when the LLM is unavailable.
- Guarantee at-most-once delivery per slot/day across restarts and double-fires.
- Keep the prompt/context layer pure and unit-testable; isolate the LLM and DB at the edges.
- Make the idle reminder cooperate so the two workers never double-notify.

**Non-Goals:**
- Per-user coaching (single `DEFAULT_USER_ID` only for now).
- Configurable slot times, quiet hours, or user-tunable tone.
- Conversation / multi-turn coaching — each message is one-shot.
- Persisting coaching message history beyond the dedup log.
- Streaming responses or token accounting.

## Decisions

- **`setTimeout` to the next slot, not BullMQ or `setInterval`.** `nextRunDelayMs` computes
  the delay to the soonest future slot (rolling to tomorrow after the last), the worker sleeps
  exactly that long, runs, and recomputes. This is precise to the slot hour and avoids both
  Redis coupling and interval drift.
- **At-most-once via an atomic claim.** Before generating, the worker calls
  `NotificationRepository.claim(user, 'coaching', coachingDedupKey(now, slot))`, which does an
  `INSERT ... ON CONFLICT (user_id, dedup_key) DO NOTHING` and returns whether the row was
  inserted. Only the winner sends, so a restart, retry, or double-fire within the same day/slot
  is silently skipped. The key is `coaching:YYYY-MM-DD:slot`.
- **Pure context/prompt layer.** `coachingContext.ts` holds only pure functions
  (`buildCoachingContext`, `buildCoachingPrompt`, `contextSummary`, `fallbackCoaching`,
  scheduling/dedup helpers). The worker fetches data and wires it in, so prompt shape and
  scheduling are unit-testable with no DB or network.
- **Morning = loss-aversion review of yesterday.** The 07:00 slot uses a distinct prompt
  (`buildMorningLossAversionPrompt`) that reviews *yesterday's* scheduled habits — comparing
  what was scheduled for yesterday's weekday against what was logged in yesterday's window
  (`getHabitTypeIdsLoggedBetween`) — and highlights the misses as concrete loss plus one
  improvement for today. Midday/night use the general prompt: fire up semangat AND invoke
  fear of losing the dream.
- **Direct Gemini call via Node `https`.** `generateText` POSTs to the Generative Language
  API with no SDK (mirrors `telegram.ts`), behind a single function so the provider is
  swappable. Model defaults to `GEMINI_MODEL` then `gemini-2.5-flash`; temperature defaults
  high (0.9) for fresh phrasing. Requires `GEMINI_API_KEY`; rejects when unset, on non-2xx,
  on empty candidates, or on a 30s timeout.
- **Graceful fallback over silence.** If `generateText` rejects for any reason, the worker
  logs a warning and sends `fallbackCoaching(ctx)` — a slot-specific static message (the
  morning fallback is grounded in yesterday's misses). A nudge always lands.
- **Idle reminder steps aside near a slot.** `isNearCoachingSlot(now, 15)` returns true within
  ±15 min of any slot; the idle worker returns early then, so it never stacks on top of the
  coaching message. The two workers stay independent but coordinate through this pure check.
- **Held-mission reminders reuse the dedup log for rate-limiting.** When missions are on hold,
  the idle worker sends `buildHeldMissionReminder(held)` at most once per 2 hours, gated by
  `NotificationRepository.sentWithinMinutes(user, 120, 'held')` and recorded via `record`.
  Only one proactive notification is sent per tick (held reminder returns early), so it never
  collides with the idle nudge.

## Risks / Trade-offs

- **No quiet hours** — coaching fires at 23:00 by design (debrief); acceptable for the
  single-user MVP.
- **LLM cost / latency** — one short call per slot (3/day) with a 30s timeout and a fallback;
  cost is negligible and a slow/failed call degrades to static copy.
- **Prompt drift / hallucinated numbers** — mitigated by feeding a compact, factual
  `contextSummary` and instructing the model not to invent figures; still model-dependent.
- **Local-timezone dependence** — slot detection uses `Date.getHours()`, so `TZ` must be set
  or slots fire in the wrong local hours.
- **Single-user assumption** — hardcoded `DEFAULT_USER_ID` must be generalized before
  multi-user, same as the other workers.
