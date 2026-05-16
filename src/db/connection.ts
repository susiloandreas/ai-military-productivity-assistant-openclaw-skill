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
  retryStrategy: () => null, // Don't retry — just fail silently
  enableReadyCheck: false,
  lazyConnect: true,
});

redisConnection.on('error', (err) => {
  console.warn('Redis unavailable (non-critical):', err.message);
});

redisConnection.connect().catch((err) => {
  console.warn('Could not connect to Redis:', err.message);
});
