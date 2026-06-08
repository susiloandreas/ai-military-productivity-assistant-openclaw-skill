import 'dotenv/config';
import { getTelegramUpdates, sendTelegramMessage } from '../utils/telegram';
import { parseMissionMessage } from '../nlp/missionParser';
import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService } from '../services/GoalService';
import { MissionService } from '../services/MissionService';
import { formatMinutes } from '../utils/duration';
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
  const parsed = parseMissionMessage(text);
  if (!parsed) return; // not a mission request — stay silent

  try {
    const mission = await missionService.start(
      DEFAULT_USER_ID,
      parsed.title,
      parsed.etaStr,
      parsed.categoryName
    );
    const lines = [`🎯 <b>Mission registered:</b> ${mission.title}`];
    if (mission.eta_minutes) lines.push(`ETA: ${formatMinutes(mission.eta_minutes)}`);
    if (mission.habit_category_id) lines.push(`Category: ${parsed.categoryName}`);
    await sendTelegramMessage(lines.join('\n'));
    console.log(`[Telegram Listener] Registered mission "${mission.title}"`);
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[Telegram Listener] Could not register mission: ${message}`);
    await sendTelegramMessage(`⚠ Could not register mission: ${message}`).catch(() => null);
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
