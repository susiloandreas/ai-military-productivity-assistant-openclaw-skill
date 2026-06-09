import 'dotenv/config';
import { getTelegramUpdates, sendTelegramMessage } from '../utils/telegram';
import { parseIntent, parseExpiryStatusReply } from '../nlp/missionParser';
import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService } from '../services/GoalService';
import { MissionService } from '../services/MissionService';
import { StreakService } from '../services/StreakService';
import { StreakRepository } from '../repositories/StreakRepository';
import {
  replyStarted,
  replyCompleted,
  replyAborted,
  replyExtended,
  replyNeedExtendDuration,
  replyStatus,
  replyNotesSaved,
  replyExpiryNeedsBoth,
  replyExpiryResolved,
  replyHelp,
  replyHabitsToday,
  replyAbortNeedsTarget,
  replyError,
} from './telegramReplies';
import { AbortNeedsTargetError } from '../services/MissionService';
import { composeCoaching } from './composeCoaching';
import { composeNextStepNudge } from './composeNextStep';
import { composeCompletionCheer } from './composeCompletionCheer';
import { slotForHour } from './coachingContext';
import { DEFAULT_USER_ID } from '../types';

/** Local midnight for "logged today" lookups. */
function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Current streak for a just-completed mission — its habit-type streak when the
 * mission is habit-linked, else the overall streak. Drives the escalating cheer.
 */
async function streakCountFor(mission: { habit_type_id: string | null }): Promise<number> {
  try {
    if (mission.habit_type_id) {
      return await streakService.getHabitCurrent(DEFAULT_USER_ID, mission.habit_type_id);
    }
    return (await streakService.getSnapshot(DEFAULT_USER_ID)).overall.current;
  } catch {
    return 0;
  }
}

// ── Dependency wiring (mirrors server.ts) ────────────────────────────────────
const missionRepo = new MissionRepository();
const goalRepo = new GoalRepository();
const habitRepo = new HabitRepository();
const streakRepo = new StreakRepository();
const goalService = new GoalService(goalRepo, habitRepo);
const streakService = new StreakService(streakRepo, habitRepo);
const missionService = new MissionService(missionRepo, goalRepo, habitRepo, goalService, streakService);

const POLL_TIMEOUT_SEC = 30;
const ERROR_BACKOFF_MS = 5000;

/** Only act on messages from the operator's own chat, when one is configured. */
function isAuthorizedChat(chatId: number | undefined): boolean {
  const allowed = process.env.TELEGRAM_CHAT_ID;
  if (!allowed) return true; // no restriction configured
  return String(chatId) === String(allowed);
}

async function handleText(text: string): Promise<void> {
  const intent = parseIntent(text);

  // A mission is waiting for a "what did you do?" reply (after completion or ETA
  // expiry). A non-command message is captured as its notes; a command means the
  // user moved on, so drop the pending prompt and handle the command.
  const awaiting = await missionService.getMissionAwaitingNotes(DEFAULT_USER_ID);
  if (awaiting) {
    if (!intent) {
      // An expired mission must be resolved with a status (done / not done) AND notes.
      if (awaiting.status === 'eta_expired') {
        const { status, notes } = parseExpiryStatusReply(text);
        if (!status || !notes) {
          await sendTelegramMessage(replyExpiryNeedsBoth());
          return; // keep awaiting until both are provided
        }
        const result = await missionService.resolveExpiredMission(
          awaiting.id,
          status === 'completed',
          notes
        );
        // Follow up with an AI message tuned to the outcome: a motivational cheer
        // on success, or a recovery nudge to start the next step on failure.
        if (result.mission.status === 'completed') {
          const streak = await streakCountFor(result.mission);
          await sendTelegramMessage(replyExpiryResolved(result, Math.random, streak));
          await sendTelegramMessage(await composeCompletionCheer(result, streak)).catch(() => null);
        } else {
          await sendTelegramMessage(replyExpiryResolved(result));
          await sendTelegramMessage(await composeNextStepNudge(result.mission)).catch(() => null);
        }
        console.log(`[Telegram Listener] Resolved expired "${result.mission.title}" as ${result.mission.status}`);
        return;
      }
      // Otherwise (e.g. after a normal completion) any reply is the notes.
      const updated = await missionService.recordNotes(awaiting.id, text.trim());
      await sendTelegramMessage(replyNotesSaved(updated));
      console.log(`[Telegram Listener] Saved notes for "${updated.title}"`);
      return;
    }
    await missionService.clearNotesRequest(awaiting.id);
  }

  if (!intent) return; // not a recognized request — stay silent

  try {
    switch (intent.kind) {
      case 'start': {
        const { mission, heldMission } = await missionService.start(
          DEFAULT_USER_ID,
          intent.title,
          intent.etaStr,
          intent.categoryName
        );
        await sendTelegramMessage(replyStarted(mission, intent.categoryName, heldMission));
        console.log(
          `[Telegram Listener] Started mission "${mission.title}"` +
            (heldMission ? ` (held "${heldMission.title}")` : '')
        );
        break;
      }
      case 'complete': {
        const result = await missionService.complete(DEFAULT_USER_ID, intent.actualStr, null);
        // Ask what was done; the next free-text reply is captured into notes.
        await missionService.requestNotes(result.mission.id);
        const streak = await streakCountFor(result.mission);
        await sendTelegramMessage(replyCompleted(result, Math.random, streak));
        // Follow with an AI-generated motivational cheer that escalates with the streak.
        await sendTelegramMessage(await composeCompletionCheer(result, streak)).catch(() => null);
        console.log(`[Telegram Listener] Completed mission "${result.mission.title}"`);
        break;
      }
      case 'abort': {
        const mission = await missionService.abort(DEFAULT_USER_ID, intent.target);
        await sendTelegramMessage(replyAborted(mission));
        console.log(`[Telegram Listener] Aborted mission "${mission.title}"`);
        break;
      }
      case 'extend': {
        if (!intent.extendStr) {
          await sendTelegramMessage(replyNeedExtendDuration());
          break;
        }
        const mission = await missionService.extend(DEFAULT_USER_ID, intent.extendStr);
        await sendTelegramMessage(replyExtended(mission));
        console.log(`[Telegram Listener] Extended mission "${mission.title}"`);
        break;
      }
      case 'status': {
        const [mission, held] = await Promise.all([
          missionService.getActiveMission(DEFAULT_USER_ID),
          missionService.getHeldMissions(DEFAULT_USER_ID),
        ]);
        await sendTelegramMessage(replyStatus(mission, held));
        console.log('[Telegram Listener] Reported mission status');
        break;
      }
      case 'help': {
        await sendTelegramMessage(replyHelp());
        console.log('[Telegram Listener] Sent command help');
        break;
      }
      case 'habits': {
        const now = new Date();
        const [schedules, loggedTypeIds] = await Promise.all([
          habitRepo.getActiveSchedules(DEFAULT_USER_ID),
          missionRepo.getHabitTypeIdsLoggedSince(DEFAULT_USER_ID, startOfToday(now)),
        ]);
        await sendTelegramMessage(replyHabitsToday(schedules, new Set(loggedTypeIds), now));
        console.log("[Telegram Listener] Reported today's habits");
        break;
      }
      case 'brief': {
        // Same coaching engine as the scheduled briefs; slot follows the hour,
        // so a morning brief includes the yesterday review + 7-day habit metrics.
        const now = new Date();
        const message = await composeCoaching(missionRepo, habitRepo, DEFAULT_USER_ID, slotForHour(now.getHours()), now, streakService);
        await sendTelegramMessage(message);
        console.log('[Telegram Listener] Sent on-demand brief');
        break;
      }
    }
  } catch (err) {
    if (err instanceof AbortNeedsTargetError) {
      await sendTelegramMessage(replyAbortNeedsTarget(err.candidates)).catch(() => null);
      console.log('[Telegram Listener] Abort needs a target — asked which mission');
      return;
    }
    const message = (err as Error).message;
    console.warn(`[Telegram Listener] ${intent.kind} failed: ${message}`);
    await sendTelegramMessage(replyError(message)).catch(() => null);
  }
}

async function poll(offset: number): Promise<number> {
  const updates = await getTelegramUpdates(offset, POLL_TIMEOUT_SEC);
  let nextOffset = offset;

  for (const update of updates) {
    nextOffset = update.update_id + 1; // acknowledge even if we ignore the message
    const message = update.message;
    if (!message?.text) continue;
    if (!isAuthorizedChat(message.chat?.id)) {
      console.warn(`[Telegram Listener] Ignored message from unauthorized chat ${message.chat?.id}`);
      continue;
    }
    await handleText(message.text);
  }

  return nextOffset;
}

async function main(): Promise<void> {
  console.log('[Telegram Listener] Started — long-polling for mission messages');
  let offset = 0;

  // Continuous long-poll loop. getUpdates blocks server-side, so this is not a busy-wait.
  for (;;) {
    try {
      offset = await poll(offset);
    } catch (err) {
      console.error('[Telegram Listener] Poll error:', (err as Error).message);
      await new Promise(resolve => setTimeout(resolve, ERROR_BACKOFF_MS));
    }
  }
}

main().catch(err => {
  console.error('[Telegram Listener] Fatal startup error:', err);
  process.exit(1);
});
