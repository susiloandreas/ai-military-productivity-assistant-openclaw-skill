import 'dotenv/config';
import { Worker } from 'bullmq';
import { redisConnection } from '../db/connection';
import { MissionRepository } from '../repositories/MissionRepository';

const missionRepo = new MissionRepository();

const worker = new Worker(
  'eta-expiry',
  async job => {
    const { missionId } = job.data as { missionId: string };
    await missionRepo.markEtaExpired(missionId);
    console.log(`[ETA Worker] Mission ${missionId} marked eta_expired`);
  },
  { connection: redisConnection }
);

worker.on('failed', (job, err) => {
  console.error(`[ETA Worker] Job ${job?.id} failed:`, err);
});

console.log('[ETA Worker] Listening for eta-expiry jobs...');
