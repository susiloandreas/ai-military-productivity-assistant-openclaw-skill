import 'dotenv/config';
import { getTelegramUpdates, sendTelegramMessage } from '../utils/telegram';
import { parseIntent, parseExpiryStatusReply } from '../nlp/missionParser';
import { parsePlanEdit } from '../nlp/planParser';
import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService } from '../services/GoalService';
import { MissionService } from '../services/MissionService';
import { StreakService } from '../services/StreakService';
import { StreakRepository } from '../repositories/StreakRepository';
import { PlanRepository } from '../repositories/PlanRepository';
import { PlanService } from '../services/PlanService';
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
const planRepo = new PlanRepository();
const goalService = new GoalService(goalRepo, habitRepo);
const streakService = new StreakService(streakRepo, habitRepo);
const planService = new PlanService(planRepo, habitRepo);
const missionService = new MissionService(
  missionRepo,
  goalRepo,
  habitRepo,
  goalService,
  streakService,
  planService
);

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
    // An ETA-expired mission must be resolved before anything else. A status reply
    // ("selesai/belum, <notes>") resolves it; "perpanjang <durasi>" revives it with
    // more time. Both take precedence over generic intent parsing — otherwise
    // "selesai, ..." is mistaken for a complete command and "perpanjang" is routed
    // to a (failing) active-mission extend, which would also orphan this prompt.
    if (awaiting.status === 'eta_expired') {
      const { status, notes } = parseExpiryStatusReply(text);
      if (status) {
        if (!notes) {
          await sendTelegramMessage(replyExpiryNeedsBoth());
          return; // keep awaiting until both status AND notes are provided
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
          await sendTelegramMessage(
            await composeCompletionCheer(result, streak, result.plannedMinutes)
          ).catch(() => null);
        } else {
          await sendTelegramMessage(replyExpiryResolved(result));
          await sendTelegramMessage(await composeNextStepNudge(result.mission)).catch(() => null);
        }
        console.log(`[Telegram Listener] Resolved expired "${result.mission.title}" as ${result.mission.status}`);
        return;
      }
      if (intent?.kind === 'extend') {
        if (!intent.extendStr) {
          await sendTelegramMessage(replyNeedExtendDuration());
          return;
        }
        const mission = await missionService.extendExpiredMission(awaiting.id, intent.extendStr);
        await sendTelegramMessage(replyExtended(mission));
        console.log(`[Telegram Listener] Revived expired "${mission.title}" with more time`);
        return;
      }
      if (!intent) {
        // A free-text reply that carries no status — re-prompt for status + notes.
        await sendTelegramMessage(replyExpiryNeedsBoth());
        return;
      }
      // A different command — the user moved on; drop the prompt and handle it below.
      await missionService.clearNotesRequest(awaiting.id);
    } else if (!intent) {
      // After a normal completion, any free-text reply is captured as the notes.
      const updated = await missionService.recordNotes(awaiting.id, text.trim());
      await sendTelegramMessage(replyNotesSaved(updated));
      console.log(`[Telegram Listener] Saved notes for "${updated.title}"`);
      return;
    } else {
      // A command after a completion prompt — user moved on; drop the prompt.
      await missionService.clearNotesRequest(awaiting.id);
    }
  }

  if (!intent) {
    // Plan propose-&-confirm: a bare "gas"/"tolak" accepts or rejects a pending AI
    // proposal. It acts only when a proposal is actually waiting, so it never
    // hijacks an ordinary one-word message.
    const planEdit = parsePlanEdit(text);
    if (planEdit) {
      // accept/reject only act when a proposal is pending (so a bare "ok" with
      // nothing to confirm stays silent); edits (geser/skip/tunda) apply directly.
      const gated = planEdit.kind === 'accept' || planEdit.kind === 'reject';
      if (!gated || (await planService.getProposed(DEFAULT_USER_ID)).length > 0) {
        const result = await planService.applyEdit(DEFAULT_USER_ID, text);
        await sendTelegramMessage(result.message).catch(() => null);
        console.log(`[Telegram Listener] Plan ${planEdit.kind}`);
      }
    }
    return; // not a recognized request — stay silent
  }

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
        const result = await missionService.complete(DEFAULT_USER_ID, intent.actualStr, intent.notes);
        // Ask what was done only when no notes came inline ("selesai, <notes>");
        // the next free-text reply is then captured into notes.
        if (!intent.notes) await missionService.requestNotes(result.mission.id);
        const streak = await streakCountFor(result.mission);
        await sendTelegramMessage(replyCompleted(result, Math.random, streak));
        // Follow with an AI-generated motivational cheer that escalates with the streak,
        // flipping to an honest review when actual duration blew past the planned block.
        await sendTelegramMessage(
          await composeCompletionCheer(result, streak, result.plannedMinutes)
        ).catch(() => null);
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
        const message = await composeCoaching(missionRepo, habitRepo, DEFAULT_USER_ID, slotForHour(now.getHours()), now, streakService, planService);
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
