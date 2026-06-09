import 'dotenv/config';
import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { sendTelegramMessage } from '../utils/telegram';
import {
  buildHabitLossAversionMessage,
  buildGenericIdleMessage,
  buildHeldMissionReminder,
  findSeharusnyaHabit,
} from './idleReminderMessages';
import { isNearCoachingSlot } from './coachingContext';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { DEFAULT_USER_ID } from '../types';

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
// Don't nag about held missions more than once every 2 hours.
const HELD_REMINDER_INTERVAL_MIN = 120;

const missionRepo = new MissionRepository();
const habitRepo = new HabitRepository();
const notificationRepo = new NotificationRepository();

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function check(): Promise<void> {
  // Step aside near a coaching slot (07:00 / 13:00 / 23:00) so no nudge ever
  // stacks a second notification on top of the scheduled coaching message.
  const now = new Date();
  if (isNearCoachingSlot(now)) {
    console.log(`[Idle Reminder] ${now.toISOString()} — near coaching slot, skipping to avoid duplicate`);
    return;
  }

  const [active, held] = await Promise.all([
    missionRepo.getActive(DEFAULT_USER_ID),
    missionRepo.getHeld(DEFAULT_USER_ID),
  ]);

  // Held missions: remind (rate-limited, regardless of an active mission). Only
  // one proactive notification per tick, so this never collides with the idle nudge.
  if (held.length > 0) {
    const remindedRecently = await notificationRepo.sentWithinMinutes(
      DEFAULT_USER_ID,
      HELD_REMINDER_INTERVAL_MIN,
      'held'
    );
    if (!remindedRecently) {
      await sendTelegramMessage(buildHeldMissionReminder(held)!);
      await notificationRepo.record(DEFAULT_USER_ID, 'held');
      console.log(`[Idle Reminder] ${now.toISOString()} — reminded about ${held.length} held mission(s)`);
      return;
    }
  }

  if (active) {
    console.log(`[Idle Reminder] ${now.toISOString()} — active: "${active.title}"`);
    return;
  }

  // Idle: confront the user about scheduled habits they are losing today;
  // fall back to the generic prompt when nothing is due or missed.
  const schedules = await habitRepo.getActiveSchedules(DEFAULT_USER_ID);
  const loggedTypeIds = new Set(
    await missionRepo.getHabitTypeIdsLoggedSince(DEFAULT_USER_ID, startOfToday(now))
  );

  const lossAversion = buildHabitLossAversionMessage(schedules, loggedTypeIds, now);
  const message = lossAversion ?? buildGenericIdleMessage(findSeharusnyaHabit(schedules, loggedTypeIds, now));

  console.log(
    `[Idle Reminder] ${now.toISOString()} — no active mission, sending ` +
      `${lossAversion ? 'habit loss-aversion' : 'generic'} reminder`
  );
  await sendTelegramMessage(message);
  await notificationRepo.record(DEFAULT_USER_ID, 'idle');
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
