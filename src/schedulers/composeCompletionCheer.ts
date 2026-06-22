import { MissionCompleteResult } from '../services/MissionService';
import { generateText, fastModel } from '../utils/gemini';
import { formatMinutes } from '../utils/duration';

/**
 * After a mission is closed, the bot follows with a short coach-style REVIEW of
 * the session that just ended — a measured, non-celebratory debrief (never a
 * streak cheer). It is grounded in the session facts (actual vs target duration,
 * scheduled vs actual start, status) and judges:
 *   - duration against the matching daily-plan block's planned length (target),
 *   - whether the start ran past the block's grace window (off-plan),
 *   - and an absolute health/timer anomaly when no useful target exists.
 * AI-generated (Gemini) in English, with a deterministic static fallback when
 * the LLM is unavailable.
 */

/**
 * Healthy upper bounds (minutes) for recognizable activities, keyed by a keyword
 * in the mission title. Past the bound the session is anomalous regardless of any
 * target (15h of "tidur" is oversleeping). First match wins.
 */
const HEALTHY_MAX: { match: RegExp; maxMinutes: number; label: string }[] = [
  { match: /tidur|sleep/, maxMinutes: 10 * 60, label: 'oversleeping' },
];

/** Any single session past this is almost certainly a timer left running. */
const FORGOTTEN_TIMER_MINUTES = 16 * 60;

/** Duration is "too long" once it passes this multiple of the target. */
export const OVER_TARGET_RATIO = 1.2;

/** Duration is "short" once it drops below this multiple of the target. */
export const UNDER_TARGET_RATIO = 0.8;

/**
 * Lateness tolerance (minutes) for an ad-hoc block with no source schedule — the
 * fallback when the matching plan block carries no `grace_minutes` of its own.
 * Scheduled blocks use their schedule's grace window instead.
 */
const DEFAULT_START_GRACE_MINUTES = 30;

/** A Date as local-frame 'HH:MM'. */
function localHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * An absolute duration anomaly that holds even without a target: an oversized
 * sleep or a session so long it's almost certainly a forgotten timer. English,
 * for the review prompt/fallback. Null when nothing is off.
 */
export function durationAnomaly(result: MissionCompleteResult): string | null {
  const mins = result.mission.actual_duration_minutes;
  if (mins == null) return null;
  const title = result.mission.title.toLowerCase();
  for (const rule of HEALTHY_MAX) {
    if (rule.match.test(title) && mins > rule.maxMinutes) {
      return `${formatMinutes(mins)} is far above the healthy max of ${formatMinutes(rule.maxMinutes)} for this activity (${rule.label})`;
    }
  }
  if (mins > FORGOTTEN_TIMER_MINUTES) {
    return `${formatMinutes(mins)} is implausible for one session — likely a timer left running`;
  }
  return null;
}

/** Structured, language-neutral facts the review is built from. Pure + testable. */
export interface ReviewFacts {
  title: string;
  status: string;
  actualMinutes: number | null;
  targetMinutes: number | null;
  /** actual / target as a whole-number percentage; null without both. */
  ratioPct: number | null;
  plannedStartHHMM: string | null;
  actualStartHHMM: string | null;
  /** started_at minus the scheduled start, in minutes (negative = early); null without a plan start. */
  lateMinutes: number | null;
  graceMinutes: number;
  /** The start ran past the grace window. */
  offPlanStart: boolean;
  /** Absolute duration anomaly (oversleep / forgotten timer), else null. */
  anomaly: string | null;
  /** Goal/milestone context, English, else null. */
  goalNote: string | null;
}

/**
 * Derive the {@link ReviewFacts} from a completed mission and its matching plan
 * block. `plannedMinutes` is the block's planned length (target), `plannedStart`
 * its scheduled start ('YYYY-MM-DDTHH:MM:SS', local frame), `graceMinutes` its
 * lateness tolerance (the source schedule's `grace_minutes`).
 */
export function reviewFacts(
  result: MissionCompleteResult,
  plannedMinutes?: number | null,
  plannedStart?: string | null,
  graceMinutes?: number | null
): ReviewFacts {
  const { mission, goalProgress } = result;
  const actualMinutes = mission.actual_duration_minutes ?? null;
  const targetMinutes = plannedMinutes != null && plannedMinutes > 0 ? plannedMinutes : null;
  const ratioPct =
    actualMinutes != null && targetMinutes != null
      ? Math.round((actualMinutes / targetMinutes) * 100)
      : null;

  const startedAt = mission.started_at ? new Date(mission.started_at) : null;
  const startedValid = startedAt != null && !isNaN(startedAt.getTime());
  const plannedDate = plannedStart ? new Date(plannedStart) : null;
  const plannedValid = plannedDate != null && !isNaN(plannedDate.getTime());

  const lateMinutes =
    startedValid && plannedValid
      ? Math.round((startedAt!.getTime() - plannedDate!.getTime()) / 60000)
      : null;
  const grace = graceMinutes ?? DEFAULT_START_GRACE_MINUTES;

  let goalNote: string | null = null;
  if (goalProgress?.goalCompleted) {
    goalNote = `goal completed: "${goalProgress.goal.title}"`;
  } else if (goalProgress?.milestonesUnlocked.length) {
    goalNote = `milestone reached: ${goalProgress.milestonesUnlocked.map(m => m.title).join(', ')}`;
  } else if (goalProgress) {
    goalNote = `goal progress: ${formatMinutes(goalProgress.totalProgress)}`;
  }

  return {
    title: mission.title,
    status: mission.status,
    actualMinutes,
    targetMinutes,
    ratioPct,
    plannedStartHHMM: plannedValid ? plannedStart!.slice(11, 16) : null,
    actualStartHHMM: startedValid ? localHHMM(startedAt!) : null,
    lateMinutes,
    graceMinutes: grace,
    offPlanStart: lateMinutes != null && lateMinutes > grace,
    anomaly: durationAnomaly(result),
    goalNote,
  };
}

/**
 * The Gemini prompt — pure so it can be unit-tested. A single measured review
 * for every completion, following the coach template: judge duration against the
 * target and the start against the plan, never celebrate.
 */
export function buildCompletionPrompt(
  result: MissionCompleteResult,
  plannedMinutes?: number | null,
  plannedStart?: string | null,
  graceMinutes?: number | null
): string {
  const f = reviewFacts(result, plannedMinutes, plannedStart, graceMinutes);

  const durationLine = `- Duration: ${f.actualMinutes != null ? `${f.actualMinutes} minutes` : 'unknown'}`;
  const targetLine = `- Target duration: ${f.targetMinutes != null ? `${f.targetMinutes} minutes` : 'not set'}`;
  const startLines = f.plannedStartHHMM
    ? `- Scheduled start: ${f.plannedStartHHMM}\n- Actual start: ${f.actualStartHHMM ?? 'unknown'}${
        f.lateMinutes != null
          ? ` (${f.lateMinutes > 0 ? `${f.lateMinutes} min late` : 'on time'}, grace ${f.graceMinutes} min)`
          : ''
      }`
    : `- Scheduled start: not scheduled`;
  const anomalyLine = f.anomaly ? `\n- Anomaly: ${f.anomaly}` : '';
  const goalLine = f.goalNote ? `\n- Progress: ${f.goalNote}` : '';

  return `You are a productivity coach who cares about health, focus, and sustainable habits.

SESSION DATA
- Mission: ${f.title}
${durationLine}
${targetLine}
${startLines}
- Status: ${f.status}   // completed | abandoned${anomalyLine}${goalLine}

TASK
Write ONE short message in English reviewing the session that just ended.

RULES
- Maximum 3 sentences.
- Tone: firm, caring, and supportive, like a coach helping someone build long-term discipline.
- If the mission was completed, acknowledge that it was finished, but DO NOT praise the duration.
- If a target is set and the duration exceeds 120% of the target, explicitly state that it was too long and is a signal to improve the working pattern, not something to celebrate.
- If a target is set and the duration is within 80–120% of the target, mention that the pacing was reasonably balanced.
- If a target is set and the duration is below 80% of the target and the mission was not completed, encourage greater consistency.
- If the actual start was later than the scheduled start beyond the grace window, state that the start was off-plan and a signal to fix the timing, not something to celebrate.
- If an Anomaly is listed, treat the duration as an unhealthy signal to correct, not work to praise.
- Mention both the actual duration and the target duration when a target is set.
- Do not shame, criticize, or use words such as "amazing", "great", "impressive", "hard work", or celebrate streaks.
- You may use one emoji and Telegram HTML tags such as <b></b>.
- The final sentence must contain a concrete target duration for the next session.

OUTPUT
Return only the message, with no explanations.`;
}

/**
 * Deterministic static review when Gemini is unavailable — English, following
 * the same rules as the prompt (judge duration vs target and start vs plan,
 * never celebrate, end on a concrete next-session target).
 */
export function fallbackCompletion(
  result: MissionCompleteResult,
  plannedMinutes?: number | null,
  plannedStart?: string | null,
  graceMinutes?: number | null
): string {
  const f = reviewFacts(result, plannedMinutes, plannedStart, graceMinutes);
  const durTxt = f.actualMinutes != null ? formatMinutes(f.actualMinutes) : 'an unknown duration';
  const tgtTxt = f.targetMinutes != null ? formatMinutes(f.targetMinutes) : null;

  const parts: string[] = [];
  parts.push(f.status === 'completed' ? `Logged as complete` : `Session ended (${f.status})`);

  if (f.anomaly) {
    parts.push(`${f.anomaly} — that's an unhealthy pattern to correct, not to celebrate`);
  } else if (tgtTxt != null && f.ratioPct != null) {
    if (f.ratioPct > OVER_TARGET_RATIO * 100) {
      parts.push(
        `${durTxt} ran past the ${tgtTxt} target (${f.ratioPct}%) — too long, a signal to tighten the pattern, not to celebrate`
      );
    } else if (f.ratioPct >= UNDER_TARGET_RATIO * 100) {
      parts.push(`${durTxt} against a ${tgtTxt} target — the pacing was reasonably balanced`);
    } else if (f.status !== 'completed') {
      parts.push(`${durTxt} fell short of the ${tgtTxt} target — aim for more consistency`);
    } else {
      parts.push(`${durTxt} against a ${tgtTxt} target`);
    }
  } else {
    parts.push(`${durTxt} logged`);
  }

  if (f.offPlanStart && f.plannedStartHHMM) {
    parts.push(
      `you started ${f.lateMinutes} min after the ${f.plannedStartHHMM} plan — off-plan, fix the timing`
    );
  }

  const nextTarget = tgtTxt ?? '60m';
  const body = parts.join('. ') + '.';
  return `🎖️ <b>SESSION REVIEW — ${f.title}</b>\n\n${body}\n\n<b>NEXT:</b> aim for ${nextTarget} next session.`;
}

/** Generate the review via Gemini, falling back to the static message. */
export async function composeCompletionCheer(
  result: MissionCompleteResult,
  plannedMinutes?: number | null,
  plannedStart?: string | null,
  graceMinutes?: number | null
): Promise<string> {
  try {
    // Short message → use the faster model with a tighter token budget.
    return await generateText(
      buildCompletionPrompt(result, plannedMinutes, plannedStart, graceMinutes),
      {
        model: fastModel(),
        maxOutputTokens: 320,
        // Flash is a thinking model — disable thinking so the full short review fits.
        thinkingBudget: 0,
      }
    );
  } catch (err) {
    console.warn(`[Completion] Gemini unavailable (${(err as Error).message}) — using fallback`);
    return fallbackCompletion(result, plannedMinutes, plannedStart, graceMinutes);
  }
}
