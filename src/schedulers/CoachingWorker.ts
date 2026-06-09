import 'dotenv/config';
import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { sendTelegramMessage } from '../utils/telegram';
import { generateText } from '../utils/gemini';
import {
  COACHING_HOURS,
  slotForHour,
  nextRunDelayMs,
  buildCoachingContext,
  buildCoachingPrompt,
  fallbackCoaching,
  coachingDedupKey,
  selectYesterdayHabits,
} from './coachingContext';
import { DEFAULT_USER_ID } from '../types';

const missionRepo = new MissionRepository();
const habitRepo = new HabitRepository();
const notificationRepo = new NotificationRepository();

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build context, ask Gemini for a brief coaching message, deliver via Telegram. */
async function runCoaching(hour: number): Promise<void> {
  const now = new Date();
  const slot = slotForHour(hour);

  // Dedupe: claim this slot/day so a restart or double-fire never sends twice.
  const claimed = await notificationRepo.claim(DEFAULT_USER_ID, 'coaching', coachingDedupKey(now, slot));
  if (!claimed) {
    console.log(`[Coaching] ${slot} already sent today — skipping duplicate`);
    return;
  }

  const [activeMission, held, recentCompleted, schedules, loggedTypeIds] = await Promise.all([
    missionRepo.getActive(DEFAULT_USER_ID),
    missionRepo.getHeld(DEFAULT_USER_ID),
    missionRepo.getRecentCompleted(DEFAULT_USER_ID, 7),
    habitRepo.getActiveSchedules(DEFAULT_USER_ID),
    missionRepo.getHabitTypeIdsLoggedSince(DEFAULT_USER_ID, startOfToday(now)),
  ]);

  // Morning slot reviews yesterday's habits (loss-aversion + what to improve).
  let yesterday = null;
  if (slot === 'pagi') {
    const yStart = startOfToday(now);
    yStart.setDate(yStart.getDate() - 1);
    const yEnd = startOfToday(now);
    const loggedYesterday = await missionRepo.getHabitTypeIdsLoggedBetween(DEFAULT_USER_ID, yStart, yEnd);
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

  let message: string;
  try {
    message = await generateText(buildCoachingPrompt(ctx));
    console.log(`[Coaching] ${now.toISOString()} — ${slot} coaching via Gemini`);
  } catch (err) {
    message = fallbackCoaching(ctx);
    console.warn(`[Coaching] Gemini unavailable (${(err as Error).message}) — using fallback`);
  }

  await sendTelegramMessage(message).catch(err =>
    console.warn(`[Coaching] Could not deliver message: ${(err as Error).message}`)
  );
}

async function loop(): Promise<void> {
  for (;;) {
    const { delayMs, hour } = nextRunDelayMs(new Date(), COACHING_HOURS);
    const mins = Math.round(delayMs / 60000);
    console.log(`[Coaching] Next coaching at ${hour}:00 (in ~${mins} min)`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      await runCoaching(hour);
    } catch (err) {
      console.error('[Coaching] Run failed:', (err as Error).message);
    }
  }
}

console.log(`[Coaching] Worker started — slots at ${COACHING_HOURS.map(h => `${h}:00`).join(', ')} (TZ ${process.env.TZ ?? 'system'})`);
loop().catch(err => {
  console.error('[Coaching] Fatal error:', err);
  process.exit(1);
});
