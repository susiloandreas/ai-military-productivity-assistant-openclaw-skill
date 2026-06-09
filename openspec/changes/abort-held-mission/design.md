## Context

`MissionService.abort(userId)` fetches the active mission and marks it `failed`, removing its
ETA job. Held missions (status `paused`, set when a new mission auto-holds the current one) have
no abort path — `getHeld` lists them and they can be resumed, but never cancelled from chat. The
inbound parser classifies "batalkan / abort / stop" into a target-less `abort` intent.

## Goals / Non-Goals

**Goals:**
- Cancel a held mission from chat, by name or when it is the only one held.
- Keep the existing "abort the active mission" behavior unchanged for the common case.
- Disambiguate safely — never abort the wrong mission when the request is unclear.

**Non-Goals:**
- An interactive picker / inline keyboard (text re-prompt only).
- Aborting multiple missions in one command.
- Changing how missions are held or resumed.
- Per-user scope beyond `DEFAULT_USER_ID`.

## Decisions

- **Optional `target` on the abort intent, not a new intent.** The parser keeps the text after
  the abort trigger as `target` (null when absent). This reuses the existing trigger matching
  and keeps "batalkan" working as today, while "batalkan misi baca paper" carries a target.
  *Alternative considered:* a separate `abortHeld` intent — rejected as redundant; abort already
  means "cancel a mission", the only new data is *which* one.
- **Resolution precedence in the service.** `abort(userId, target?)`:
  1. `target` given → search active + held by case-insensitive title substring; 0 matches →
     "nothing matched" error, >1 → "ambiguous" error, 1 → abort it.
  2. no `target` → active exists → abort active (today's behavior).
  3. no `target`, no active, exactly one held → abort that held.
  4. no `target`, no active, multiple held → "which one?" error listing held titles.
  5. nothing active or held → "nothing to abort" error.
  Substring match (not exact) so the user can type a short fragment; ambiguity guard prevents
  cancelling the wrong one. *Alternative:* numeric index from a list — rejected as more stateful
  (requires remembering the last shown list) and less natural in free-text chat.
- **Reuse the `paused → failed` transition.** Aborting a held mission is the same
  `updateStatus(id, 'failed')` used for the active case; ETA-job removal stays (idempotent —
  held missions usually have no job). No schema change.
- **Errors carry the disambiguation copy.** The "which one?" and "ambiguous" cases surface as
  thrown errors caught by the listener, which renders `replyAbortNeedsTarget(held)` listing the
  held missions — mirroring how other command errors flow through `replyError`.

## Risks / Trade-offs

- **Substring false-positives** → the ambiguity guard refuses to abort when a fragment matches
  multiple missions, so the worst case is a re-prompt, never a wrong cancellation.
- **Aborting is destructive (sets `failed`)** → acceptable; it matches the existing abort
  semantics and the user explicitly asked to cancel.
