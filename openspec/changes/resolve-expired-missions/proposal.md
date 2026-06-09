## Why

When a mission's ETA passes, the ETA worker marks it `eta_expired` and asks the user what
happened. Previously any reply was just stored as notes — the mission was never actually closed
as done or not done. We need the expiry reply to *resolve* the mission: capture both a completion
decision and notes, then finalize the mission and advance any linked goals.

## What Changes

- Add `parseExpiryStatusReply` to the mission NLP parser: strip a leading status token from the
  reply and keep the remainder as notes. Not-done tokens are checked before done tokens so
  "belum selesai" resolves to *not done*, not done. Returns `status` (`completed` / `failed` /
  `null`) and `notes`.
- Require an expiry reply to carry **both** a status and notes; when either is missing, re-prompt
  with the expected format and keep the mission awaiting a reply.
- Add `MissionService.resolveExpiredMission`: set the final status (completed or failed) with
  notes, clear the awaiting-notes flag, and — when completed — compute elapsed duration and
  advance linked goals.
- Route an `eta_expired` mission's reply through this path in `TelegramListenerWorker` (distinct
  from the normal post-completion "any reply is notes" path).
- Update the ETA-expiry prompt to ask for status + notes in one message, add a re-prompt
  (`replyExpiryNeedsBoth`) and a resolution confirmation (`replyExpiryResolved`) that reports the
  outcome, duration, notes, and any goal milestone/completion progress.

## Capabilities

### New Capabilities
- `mission-expiry-resolution`: Resolve an ETA-expired mission from a single chat reply that
  carries a completion status and notes, finalizing the mission and advancing linked goals on
  completion.

### Modified Capabilities
<!-- None — the inbound Telegram listener gains a branch but no existing spec requirement changes. -->

## Impact

- New parser export `parseExpiryStatusReply` (+ `ExpiryReply`, `stripStatusToken`, DONE/NOT_DONE
  token lists) in `src/nlp/missionParser.ts`.
- New `MissionService.resolveExpiredMission`; reuses `MissionRepository.updateStatus`,
  `setAwaitingNotes`, `getById`, and the existing `advanceGoals` path.
- New `telegramReplies` helpers `replyExpiryNeedsBoth` / `replyExpiryResolved`; the ETA-expiry
  prompt (`replyEtaExpiredAskNotes`) now requests status + notes.
- `TelegramListenerWorker` branches on `awaiting.status === 'eta_expired'` to resolve instead of
  merely recording notes.
- No schema change — reuses the existing `eta_expired` status and awaiting-notes flag.
