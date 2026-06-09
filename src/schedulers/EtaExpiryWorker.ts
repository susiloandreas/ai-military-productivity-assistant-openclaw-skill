import 'dotenv/config';
import { Worker } from 'bullmq';
import { redisConnection } from '../db/connection';
import { MissionRepository } from '../repositories/MissionRepository';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { sendTelegramMessage } from '../utils/telegram';
import { replyEtaExpiredAskNotes } from './telegramReplies';
import { DEFAULT_USER_ID } from '../types';

const missionRepo = new MissionRepository();
const notificationRepo = new NotificationRepository();

const worker = new Worker(
  'eta-expiry',
  async job => {
    const { missionId } = job.data as { missionId: string };
    const mission = await missionRepo.markEtaExpired(missionId);
    if (!mission) {
      // Already completed/aborted before the timer fired — nothing to do.
      console.log(`[ETA Worker] Mission ${missionId} no longer active, skipped`);
      return;
    }
    console.log(`[ETA Worker] Mission ${missionId} marked eta_expired — asking for notes`);
    // Ask what the user did; the listener captures their reply into notes.
    await sendTelegramMessage(replyEtaExpiredAskNotes(mission)).catch(err =>
      console.warn(`[ETA Worker] Could not send ETA prompt: ${(err as Error).message}`)
    );
    // Stamp the follow-up clock so the 5-min re-ask loop spaces off this send.
    await notificationRepo.record(DEFAULT_USER_ID, 'eta_followup');
  },
  { connection: redisConnection }
);

worker.on('failed', (job, err) => {
  console.error(`[ETA Worker] Job ${job?.id} failed:`, err);
});

console.log('[ETA Worker] Listening for eta-expiry jobs...');
