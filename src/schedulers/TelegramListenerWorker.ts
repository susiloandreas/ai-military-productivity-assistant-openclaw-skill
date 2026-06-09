import 'dotenv/config';
import { getTelegramUpdates, sendTelegramMessage } from '../utils/telegram';
import { parseIntent, parseExpiryStatusReply } from '../nlp/missionParser';
import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService } from '../services/GoalService';
import { MissionService } from '../services/MissionService';
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
  replyError,
} from './telegramReplies';
import { DEFAULT_USER_ID } from '../types';

// ── Dependency wiring (mirrors server.ts) ────────────────────────────────────
const missionRepo = new MissionRepository();
const goalRepo = new GoalRepository();
const habitRepo = new HabitRepository();
const goalService = new GoalService(goalRepo, habitRepo);
const missionService = new MissionService(missionRepo, goalRepo, habitRepo, goalService);

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
        await sendTelegramMessage(replyExpiryResolved(result));
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
        await sendTelegramMessage(replyCompleted(result));
        console.log(`[Telegram Listener] Completed mission "${result.mission.title}"`);
        break;
      }
      case 'abort': {
        const mission = await missionService.abort(DEFAULT_USER_ID);
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
    }
  } catch (err) {
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
