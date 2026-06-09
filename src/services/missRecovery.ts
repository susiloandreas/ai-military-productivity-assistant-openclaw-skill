/**
 * Miss-recovery policy (pure). A missed scheduled habit is treated as a
 * recoverable event, not a failure: a single miss gets a gentle nudge plus a
 * 2-minute minimum-viable offer to keep the chain alive; only a SECOND
 * consecutive missed scheduled day escalates ("never miss twice"). Logging the
 * habit — including the minimum version — resets the count to 0, so escalation
 * never persists past a recovery.
 */

import { shouldUseLossAversion } from './toneGate';

/** The smallest acceptable version of a habit that still keeps the chain alive. */
export const MINIMUM_VIABLE_MINUTES = 2;

export type RecoveryDecision = 'recoverable' | 'escalate';

export interface RecoveryState {
  decision: RecoveryDecision;
  /** Whether to offer the 2-minute minimum-viable version. */
  offerMinimumViable: boolean;
}

/**
 * Decide how to treat a miss given how many consecutive scheduled days have been
 * missed. 0–1 → recoverable (gentle); 2+ → escalate. Delegates the escalate
 * decision to the shared tone gate so recovery and coaching never disagree.
 */
export function recoveryState(consecutiveMisses: number): RecoveryState {
  const escalate = shouldUseLossAversion({ maxConsecutiveMisses: consecutiveMisses });
  return { decision: escalate ? 'escalate' : 'recoverable', offerMinimumViable: true };
}
