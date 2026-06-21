import 'dotenv/config';
import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { StreakRepository } from '../repositories/StreakRepository';
import { PlanRepository } from '../repositories/PlanRepository';
import { StreakService } from '../services/StreakService';
import { PlanService } from '../services/PlanService';
import { sendTelegramMessage } from '../utils/telegram';
import { COACHING_HOURS, slotForHour, nextRunDelayMs, coachingDedupKey } from './coachingContext';
import { composeCoaching } from './composeCoaching';
import { DEFAULT_USER_ID } from '../types';

const missionRepo = new MissionRepository();
const habitRepo = new HabitRepository();
const notificationRepo = new NotificationRepository();
const streakService = new StreakService(new StreakRepository(), habitRepo);
const planService = new PlanService(new PlanRepository(), habitRepo);

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

  const message = await composeCoaching(missionRepo, habitRepo, DEFAULT_USER_ID, slot, now, streakService, planService);
  console.log(`[Coaching] ${now.toISOString()} — sent ${slot} coaching`);

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
