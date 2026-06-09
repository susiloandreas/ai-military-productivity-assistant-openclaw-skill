## 1. Parser

- [x] 1.1 Add an optional `target: string | null` to the `abort` member of `ParsedIntent`
- [x] 1.2 In `parseIntent`, capture the text after the abort trigger as `target` (null when empty), trimming glue
- [x] 1.3 Unit-test: bare "batalkan" → `{ kind: 'abort', target: null }`; "batalkan misi baca paper" → target `"baca paper"`

## 2. Service resolution

- [x] 2.1 Change `MissionService.abort(userId, target?)` to resolve per the precedence rules (target match → active → single held → disambiguate)
- [x] 2.2 Target path: match active + held by case-insensitive title substring; throw "nothing matched" on 0, "ambiguous" on >1, abort on exactly 1
- [x] 2.3 No-target path: abort active if present; else single held; else throw "which one?" (multiple held) or "nothing to abort" (none)
- [x] 2.4 Abort = `updateStatus(id, 'failed')` + idempotent ETA-job removal, for both active and held
- [x] 2.5 Unit-test every branch (mock repository + ETA queue)

## 3. Telegram reply + listener

- [x] 3.1 Add `replyAbortNeedsTarget(held)` listing held missions and asking which to cancel
- [x] 3.2 Pass `intent.target` into `missionService.abort` in the `abort` case
- [x] 3.3 Render `replyAbortNeedsTarget` for the "which one?" / ambiguous errors; keep `replyAborted` for success
- [x] 3.4 Unit-test the new reply formatter

## 4. Verify

- [x] 4.1 `tsc --noEmit` clean and full Jest suite green
