## Why

Abort today only cancels the *active* mission. Missions that were auto-held (paused when a new
one started) can pile up with no way to cancel them from chat — the user can resume them but not
drop one they have decided to abandon, so stale held missions linger and nag forever.

## What Changes

- Extend the `abort` intent so a held (paused) mission can be cancelled, not just the active one.
- Let the abort message carry an optional target (a title fragment) so the user can name which
  mission to cancel, e.g. "batalkan misi baca paper".
- Resolution rules for `MissionService.abort(userId, target?)`:
  - With a **target**: cancel the active or held mission whose title matches (case-insensitive
    substring); error if none matches, or if the fragment is ambiguous (matches more than one).
  - With **no target**: cancel the active mission if one exists; else if exactly one mission is
    held, cancel it; else (multiple held, no active) reply asking the user to name which one.
- Cancelling sets the mission to `failed` and removes any pending ETA expiry job (held missions
  normally have none, but the removal stays idempotent).
- Telegram reply confirms which mission was aborted; a new reply re-prompts when the target is
  missing/ambiguous and lists the held missions to choose from.

## Capabilities

### New Capabilities
- `mission-abort`: Cancelling a mission from chat — the active mission or a named/single held
  mission — with disambiguation when the target is unclear.

### Modified Capabilities
<!-- None — abort has no existing spec; it is captured fresh under the new capability. -->

## Impact

- `MissionService.abort` gains an optional `target` argument and held-mission resolution; reuses
  `MissionRepository.getActive`, `getHeld`, `getById`, and `updateStatus`.
- Parser: the `abort` intent gains an optional `target` field (text after the abort trigger);
  `ParsedIntent` and `parseIntent` updated.
- Listener: the `abort` case passes the target and handles the "which one?" re-prompt.
- Replies: `replyAborted` unchanged for the success case; new `replyAbortNeedsTarget(held)` for
  the ambiguous/missing-target case.
- No schema or migration changes — uses the existing `paused` → `failed` transition.
