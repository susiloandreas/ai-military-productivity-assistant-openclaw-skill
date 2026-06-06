import 'dotenv/config';
import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { sendTelegramMessage } from '../utils/telegram';
import { buildHabitLossAversionMessage, buildGenericIdleMessage, findSeharusnyaHabit } from './idleReminderMessages';
import { DEFAULT_USER_ID } from '../types';

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const missionRepo = new MissionRepository();
const habitRepo = new HabitRepository();

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function check(): Promise<void> {
  const active = await missionRepo.getActive(DEFAULT_USER_ID);
  if (active) {
    console.log(`[Idle Reminder] ${new Date().toISOString()} — active: "${active.title}"`);
    return;
  }

  // Idle: confront the user about scheduled habits they are losing today;
  // fall back to the generic prompt when nothing is due or missed.
  const now = new Date();
  const schedules = await habitRepo.getActiveSchedules(DEFAULT_USER_ID);
  const loggedTypeIds = new Set(
    await habitRepo.getHabitTypeIdsLoggedSince(DEFAULT_USER_ID, startOfToday(now))
  );

  const lossAversion = buildHabitLossAversionMessage(schedules, loggedTypeIds, now);
  const message = lossAversion ?? buildGenericIdleMessage(findSeharusnyaHabit(schedules, loggedTypeIds, now));

  console.log(
    `[Idle Reminder] ${now.toISOString()} — no active mission, sending ` +
      `${lossAversion ? 'habit loss-aversion' : 'generic'} reminder`
  );
  await sendTelegramMessage(message);
}

async function main(): Promise<void> {
  console.log('[Idle Reminder] Worker started — checking every 15 minutes');

  // Run immediately on startup, then on interval
  await check().catch(err => console.error('[Idle Reminder] Check failed:', err));
  setInterval(() => {
    check().catch(err => console.error('[Idle Reminder] Check failed:', err));
  }, INTERVAL_MS);
}

main().catch(err => {
  console.error('[Idle Reminder] Fatal startup error:', err);
  process.exit(1);
});
