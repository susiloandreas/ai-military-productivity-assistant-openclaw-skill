## Context

The ETA worker already transitions a live mission to `eta_expired` and sets an awaiting-notes
flag, and the Telegram listener already has an "awaiting notes → store the reply as notes" path
for normal completions. Expiry is different: the system does not yet know whether the user
actually finished, so the reply must both decide the outcome and explain it. We reuse the
existing awaiting-notes machinery but branch on the `eta_expired` status.

## Goals / Non-Goals

**Goals:**
- Resolve an expired mission as done or not done from one natural-language reply.
- Capture notes in the same reply.
- Finalize the mission and advance linked goals when completed.
- Re-prompt clearly when the reply is incomplete, without losing the awaiting state.

**Non-Goals:**
- A structured command syntax — the reply is free text with a leading intent token.
- Editing notes after resolution (the existing append-notes path still covers that).
- Multi-mission resolution in one reply.

## Decisions

- **Token-strip parsing, not-done first.** `parseExpiryStatusReply` tries NOT_DONE tokens before
  DONE tokens so a reply like "belum selesai ..." resolves to *not done* even though it contains
  "selesai". The matched leading token is stripped and the cleaned remainder becomes the notes;
  no status token yields `status: null` with the whole text as notes.
- **Both status and notes are required.** The listener resolves only when `status` and non-empty
  `notes` are both present; otherwise it sends `replyExpiryNeedsBoth` and leaves the mission
  awaiting, so the user is nudged to the `status + notes` format and nothing is finalized on a
  partial reply.
- **Elapsed duration for completion.** On completion the service computes elapsed minutes from
  `started_at` to now (floored at 1) as the actual duration, mirroring how live missions record
  time, then advances goals with that duration.
- **Not-done finalizes as `failed` with no goal progress.** A not-done resolution records notes
  and the `failed` status and returns no goal progress — a missed mission should not move a goal.
- **Reuse `advanceGoals`.** Goal advancement is the same path used elsewhere, so a resolved
  completion unlocks milestones / completes goals exactly like a normal completion; the
  confirmation surfaces any milestone or goal completion.
- **Branch in the listener, reuse awaiting-notes.** Rather than a new awaiting state, the listener
  inspects `awaiting.status === 'eta_expired'` and routes to resolution; all other awaiting cases
  keep the existing "reply is notes" behavior.

## Risks / Trade-offs

- **Ambiguous replies** — a free-text reply with no recognizable token is treated as missing a
  status and re-prompted; acceptable, and the token lists are broad (Indonesian + English +
  emoji).
- **Duration approximation** — elapsed time assumes the user worked from `started_at` to the
  reply; for a long-overdue reply this overstates effort. Accepted for now; the user-supplied
  notes provide the real context.
