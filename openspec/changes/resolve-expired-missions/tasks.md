## 1. Expiry reply parsing

- [x] 1.1 Add `parseExpiryStatusReply` + `ExpiryReply` and DONE / NOT_DONE token lists in `src/nlp/missionParser.ts`
- [x] 1.2 Strip a leading status token (NOT_DONE checked first so "belum selesai" wins) and return the cleaned remainder as notes; no token → `status: null`, whole text as notes
- [x] 1.3 Unit-test the parser (done/not-done/none, precedence, notes extraction)

## 2. Mission resolution

- [x] 2.1 Add `MissionService.resolveExpiredMission(id, completed, notes)`
- [x] 2.2 Not completed → set `failed` with notes, clear awaiting-notes, no goal progress
- [x] 2.3 Completed → compute elapsed minutes (floored at 1), set `completed` with duration + notes, clear awaiting-notes, advance linked goals
- [x] 2.4 Unit-test both branches (mock repository + goal advancement)

## 3. Telegram wiring

- [x] 3.1 Branch the listener on `awaiting.status === 'eta_expired'` to resolve instead of recording notes
- [x] 3.2 Require both status and notes; otherwise send `replyExpiryNeedsBoth` and keep awaiting
- [x] 3.3 Update `replyEtaExpiredAskNotes` to request status + notes; add `replyExpiryResolved` reporting outcome, duration, notes, and goal progress
- [x] 3.4 Unit-test the reply formatters
