import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { generateText } from '../utils/gemini';
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
  now: Date
): Promise<string> {
  const [activeMission, held, recentCompleted, schedules, loggedTypeIds] = await Promise.all([
    missionRepo.getActive(userId),
    missionRepo.getHeld(userId),
    missionRepo.getRecentCompleted(userId, 7),
    habitRepo.getActiveSchedules(userId),
    missionRepo.getHabitTypeIdsLoggedSince(userId, startOfToday(now)),
  ]);

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
    loggedTypeIds: new Set(loggedTypeIds),
    now,
    yesterday,
  });

  try {
    return await generateText(buildCoachingPrompt(ctx));
  } catch (err) {
    console.warn(`[Coaching] Gemini unavailable (${(err as Error).message}) — using fallback`);
    return fallbackCoaching(ctx);
  }
}
