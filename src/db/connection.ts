import 'dotenv/config';
import { Pool } from 'pg';
import IORedis from 'ioredis';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

// Redis is optional for v1 (used only for BullMQ ETA expiry jobs)
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  // Reconnect with capped backoff. Returning null here (the old behaviour) meant
  // the connection died permanently on the FIRST disconnect — a Redis restart,
  // deploy, or reaped idle socket — which silently stopped the BullMQ ETA worker
  // (its blocking connection never recovered) until the process was restarted.
  retryStrategy: (times) => Math.min(times * 200, 5000),
  // Reconnect when Redis reports it's in read-only / failover state.
  reconnectOnError: () => true,
  enableReadyCheck: false,
  lazyConnect: true,
});

redisConnection.on('error', (err) => {
  console.warn('Redis unavailable (non-critical):', err.message);
});

redisConnection.connect().catch((err) => {
  console.warn('Could not connect to Redis:', err.message);
});
