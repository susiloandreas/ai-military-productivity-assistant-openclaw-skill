/**
 * The single source of truth for message tone (pure). Competence/mastery is the
 * DEFAULT; loss-aversion (fear of losing the dream) is reserved for genuine
 * inflection points so it keeps its edge instead of becoming background noise:
 *   - an active streak that will break TODAY if a sustaining habit isn't logged;
 *   - two or more consecutive missed scheduled days ("never miss twice");
 *   - the nightly debrief.
 *
 * Coaching, reminders, and AI prompts all route through this so they agree on the
 * same decision for the same state.
 */

export type Tone = 'competence' | 'loss_aversion';

export interface ToneContext {
  /** An active streak will break today unless a sustaining habit is logged. */
  streakAtRiskToday?: boolean;
  /** Max consecutive missed scheduled days across the user's habits. */
  maxConsecutiveMisses?: number;
  /** This message is the nightly debrief. */
  isNightlyDebrief?: boolean;
}

/** True only at an inflection point — see module docs. */
export function shouldUseLossAversion(ctx: ToneContext): boolean {
  return (
    ctx.streakAtRiskToday === true ||
    (ctx.maxConsecutiveMisses ?? 0) >= 2 ||
    ctx.isNightlyDebrief === true
  );
}

/** The tone to use for a given state. */
export function toneFor(ctx: ToneContext): Tone {
  return shouldUseLossAversion(ctx) ? 'loss_aversion' : 'competence';
}
