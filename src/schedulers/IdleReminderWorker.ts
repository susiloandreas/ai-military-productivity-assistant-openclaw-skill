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
import { replyEtaExpiredAskNotes } from './telegramReplies';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { StreakRepository } from '../repositories/StreakRepository';
import { consecutiveMisses } from '../services/streakMath';
import { DEFAULT_USER_ID, Mission } from '../types';

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
// Don't nag about held missions more than once every 2 hours.
const HELD_REMINDER_INTERVAL_MIN = 120;
// Re-ask "what did you do?" for an unanswered ETA-expired mission this often.
const ETA_FOLLOWUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ETA_FOLLOWUP_MIN = 5;

const missionRepo = new MissionRepository();
const habitRepo = new HabitRepository();
const notificationRepo = new NotificationRepository();
const streakRepo = new StreakRepository();

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True once an active mission's ETA deadline (started_at + eta_minutes) has passed. */
function etaDeadlinePassed(mission: Mission, now: Date): boolean {
  if (mission.eta_minutes == null) return false;
  const deadline = new Date(mission.started_at).getTime() + mission.eta_minutes * 60_000;
  return now.getTime() >= deadline;
}

async function check(): Promise<void> {
  // Step aside near a coaching slot (07:00 / 13:00 / 23:00) so no nudge ever
  // stacks a second notification on top of the scheduled coaching message.
  const now = new Date();
  if (isNearCoachingSlot(now)) {
    console.log(`[Idle Reminder] ${now.toISOString()} — near coaching slot, skipping to avoid duplicate`);
    return;
  }

  // A mission awaiting a "what did you do?" reply (e.g. after ETA expiry) is an
  // open follow-up the user still owes us. Stay silent rather than stacking an
  // idle nudge on top of that prompt — we're already following up.
  const awaitingNotes = await missionRepo.getAwaitingNotes(DEFAULT_USER_ID);
  if (awaitingNotes) {
    console.log(
      `[Idle Reminder] ${now.toISOString()} — awaiting notes for "${awaitingNotes.title}" (${awaitingNotes.status}), skipping nudge`
    );
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
    // An overdue active mission is handled by the dedicated ETA follow-up loop.
    console.log(`[Idle Reminder] ${now.toISOString()} — active: "${active.title}"`);
    return;
  }

  // Idle: confront the user about scheduled habits they are losing today;
  // fall back to the generic prompt when nothing is due or missed.
  const schedules = await habitRepo.getActiveSchedules(DEFAULT_USER_ID);
  const loggedTypeIds = new Set(
    await missionRepo.getHabitTypeIdsLoggedSince(DEFAULT_USER_ID, startOfToday(now))
  );

  // Consecutive missed scheduled days per habit-type → drives gentle-vs-escalate
  // recovery framing ("never miss twice").
  const streakRows = await streakRepo.getAll(DEFAULT_USER_ID);
  const rowByType = new Map(streakRows.filter(r => r.habit_type_id).map(r => [r.habit_type_id!, r]));
  const missCountByType = new Map<string, number>();
  for (const s of schedules) {
    missCountByType.set(
      s.habit_type_id,
      consecutiveMisses(rowByType.get(s.habit_type_id) ?? null, s, now)
    );
  }

  const lossAversion = buildHabitLossAversionMessage(schedules, loggedTypeIds, now, Math.random, missCountByType);
  const message = lossAversion ?? buildGenericIdleMessage(findSeharusnyaHabit(schedules, loggedTypeIds, now));

  console.log(
    `[Idle Reminder] ${now.toISOString()} — no active mission, sending ` +
      `${lossAversion ? 'habit loss-aversion' : 'generic'} reminder`
  );
  await sendTelegramMessage(message);
  await notificationRepo.record(DEFAULT_USER_ID, 'idle');
}

/** Send the "what did you do?" prompt and stamp the 5-min follow-up clock. */
async function sendEtaPrompt(mission: Mission): Promise<void> {
  await sendTelegramMessage(replyEtaExpiredAskNotes(mission)).catch(err =>
    console.warn(`[ETA Follow-up] Could not send ETA prompt: ${(err as Error).message}`)
  );
  await notificationRepo.record(DEFAULT_USER_ID, 'eta_followup');
}

/**
 * Keeps after an ETA-expired mission until the user resolves it. Runs every 5
 * minutes, independent of the 15-minute idle cycle, so the follow-up cadence
 * never speeds up the unrelated idle nudges.
 */
async function etaFollowUp(): Promise<void> {
  const now = new Date();

  // Backstop: an overdue mission still flagged 'active' means the EtaExpiryWorker
  // job hasn't fired (delayed/failed). Flip it and send the first prompt.
  // markEtaExpired is atomic (WHERE status = 'active'), so the real ETA job — or
  // a concurrent tick — can never double-prompt.
  const active = await missionRepo.getActive(DEFAULT_USER_ID);
  if (active && etaDeadlinePassed(active, now)) {
    const expired = await missionRepo.markEtaExpired(active.id);
    if (expired) {
      console.log(`[ETA Follow-up] ${now.toISOString()} — ETA passed for "${expired.title}", marking eta_expired (backstop)`);
      await sendEtaPrompt(expired);
    }
    return;
  }

  // Re-ask about an unanswered ETA-expired mission, at most once per 5 minutes.
  const awaiting = await missionRepo.getAwaitingNotes(DEFAULT_USER_ID);
  if (awaiting?.status === 'eta_expired') {
    const askedRecently = await notificationRepo.sentWithinMinutes(
      DEFAULT_USER_ID,
      ETA_FOLLOWUP_MIN,
      'eta_followup'
    );
    if (!askedRecently) {
      console.log(`[ETA Follow-up] ${now.toISOString()} — re-asking notes for "${awaiting.title}"`);
      await sendEtaPrompt(awaiting);
    }
  }
}

async function main(): Promise<void> {
  console.log('[Idle Reminder] Worker started — idle check every 15 min, ETA follow-up every 5 min');

  // Run both immediately on startup, then on their own intervals.
  await check().catch(err => console.error('[Idle Reminder] Check failed:', err));
  await etaFollowUp().catch(err => console.error('[ETA Follow-up] Check failed:', err));
  setInterval(() => {
    check().catch(err => console.error('[Idle Reminder] Check failed:', err));
  }, INTERVAL_MS);
  setInterval(() => {
    etaFollowUp().catch(err => console.error('[ETA Follow-up] Check failed:', err));
  }, ETA_FOLLOWUP_INTERVAL_MS);
}

main().catch(err => {
  console.error('[Idle Reminder] Fatal startup error:', err);
  process.exit(1);
});
