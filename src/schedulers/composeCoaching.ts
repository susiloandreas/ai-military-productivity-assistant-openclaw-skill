import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { StreakService } from '../services/StreakService';
import { PlanService } from '../services/PlanService';
import { generateText } from '../utils/gemini';
import { Tone, toneFor } from '../services/toneGate';
import { PlanBlock, StreakSnapshot } from '../types';

/** A propose-&-confirm footer for the morning brief: the drafted catch-up blocks + how to accept. */
function renderProposalFooter(proposed: PlanBlock[]): string {
  const lines = proposed.map(b => `• ${b.start_time.slice(0, 5)} ${b.title}`).join('\n');
  return `📋 <b>USULAN RENCANA SUSULAN</b>\n${lines}\n\nBalas <b>"gas"</b> untuk pakai, <b>"tolak"</b> untuk lewati.`;
}
import {
  CoachingSlot,
  buildCoachingContext,
  buildCoachingPrompt,
  fallbackCoaching,
  selectYesterdayHabits,
} from './coachingContext';

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Gather the user's mission/habit state for a slot, ask Gemini for the coaching
 * message, and fall back to a static message if Gemini is unavailable. Shared by
 * the scheduled CoachingWorker and the on-demand `/brief` command so both render
 * the same brief (including the morning yesterday-review + 7-day habit metrics).
 */
export async function composeCoaching(
  missionRepo: MissionRepository,
  habitRepo: HabitRepository,
  userId: string,
  slot: CoachingSlot,
  now: Date,
  // Optional: when provided, the message tone is computed from live streak state
  // and the user's streaks are surfaced in the brief; otherwise tone defaults by slot.
  streakService?: StreakService,
  // Optional: when provided, today's DUE list is sourced from the day plan so it
  // respects skips/moves/done; multi-day metrics still use the template schedules.
  planService?: PlanService
): Promise<string> {
  const [activeMission, held, recentCompleted, schedules, loggedTypeIds] = await Promise.all([
    missionRepo.getActive(userId),
    missionRepo.getHeld(userId),
    missionRepo.getRecentCompleted(userId, 7),
    habitRepo.getActiveSchedules(userId),
    missionRepo.getHabitTypeIdsLoggedSince(userId, startOfToday(now)),
  ]);

  // Today's due list from the plan (respects edits); falls back to the template.
  const dueSchedules = planService
    ? (await planService.getReminderSchedules(userId, now)).schedules
    : undefined;

  // Tone gate + streak surfacing from live state. Loss-aversion only at inflection
  // points (a streak about to break today, ≥2 consecutive misses, nightly debrief).
  let tone: Tone = toneFor({ isNightlyDebrief: slot === 'malam' });
  let streaks: StreakSnapshot | undefined;
  if (streakService) {
    const [signals, snapshot] = await Promise.all([
      streakService.toneSignals(userId, new Set(loggedTypeIds), now),
      streakService.getSnapshot(userId, now),
    ]);
    tone = toneFor({ isNightlyDebrief: slot === 'malam', ...signals });
    streaks = snapshot;
  }

  // Morning slot reviews yesterday's habits (loss-aversion + what to improve).
  let yesterday = null;
  if (slot === 'pagi') {
    const yStart = startOfToday(now);
    yStart.setDate(yStart.getDate() - 1);
    const yEnd = startOfToday(now);
    const loggedYesterday = await missionRepo.getHabitTypeIdsLoggedBetween(userId, yStart, yEnd);
    yesterday = selectYesterdayHabits(schedules, new Set(loggedYesterday), now);
  }

  const ctx = buildCoachingContext({
    slot,
    activeMission,
    held,
    recentCompleted,
    schedules,
    dueSchedules,
    loggedTypeIds: new Set(loggedTypeIds),
    now,
    yesterday,
    tone,
    streaks,
  });

  let base: string;
  try {
    // The brief runs on the strong (Pro) thinking model, whose reasoning tokens
    // bill against maxOutputTokens — with the tight default cap it hits
    // MAX_TOKENS while still thinking and returns no visible text, so every
    // brief fell back to the static message. Pro can't disable thinking
    // (Flash-only), but a bounded budget leaves guaranteed room for the reply.
    base = await generateText(buildCoachingPrompt(ctx), {
      maxOutputTokens: 4096,
      thinkingBudget: 1024,
    });
  } catch (err) {
    console.warn(`[Coaching] Gemini unavailable (${(err as Error).message}) — using fallback`);
    base = fallbackCoaching(ctx);
  }

  // Propose-&-confirm: the morning brief drafts a catch-up plan for what's already
  // been missed today. Append-only (after the LLM call), so it never competes for
  // the token budget; the blocks are written 'proposed' and stay inert until the
  // user replies "gas".
  if (planService && slot === 'pagi') {
    try {
      const proposed = await planService.proposeDay(userId, now);
      if (proposed.length > 0) base += '\n\n' + renderProposalFooter(proposed);
    } catch (err) {
      console.warn(`[Coaching] proposeDay failed: ${(err as Error).message}`);
    }
  }
  return base;
}
