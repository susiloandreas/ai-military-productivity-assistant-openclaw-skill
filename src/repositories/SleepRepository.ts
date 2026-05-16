import { pool } from '../db/connection';
import { SleepLog } from '../types';

const DEFAULT_TARGET_MINUTES = 480; // 8 hours

export class SleepRepository {
  async create(
    userId: string,
    durationMinutes: number,
    wakeTime: Date | null,
    quality: 'poor' | 'fair' | 'good' | 'excellent' | null,
    notes?: string
  ): Promise<SleepLog> {
    const { rows } = await pool.query<SleepLog>(
      `INSERT INTO sleep_logs (user_id, duration_minutes, wake_time, sleep_quality, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, durationMinutes, wakeTime, quality, notes ?? null]
    );
    return rows[0];
  }

  async getRecent(userId: string, days = 7): Promise<SleepLog[]> {
    const { rows } = await pool.query<SleepLog>(
      `SELECT * FROM sleep_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY logged_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async getLastLog(userId: string): Promise<SleepLog | null> {
    const { rows } = await pool.query<SleepLog>(
      `SELECT * FROM sleep_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async getDebtMinutes(
    userId: string,
    days = 7,
    targetMinutes = DEFAULT_TARGET_MINUTES
  ): Promise<number> {
    const { rows } = await pool.query<{ avg_sleep: string; cnt: string }>(
      `SELECT AVG(duration_minutes) AS avg_sleep, COUNT(*) AS cnt
       FROM sleep_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '1 day' * $2`,
      [userId, days]
    );
    const count = Number(rows[0].cnt);
    if (count === 0) return 0;
    const deficit = targetMinutes - Number(rows[0].avg_sleep);
    return deficit > 0 ? Math.round(deficit) : 0;
  }

  // Returns a numeric 1-4 score: poor=1, fair=2, good=3, excellent=4
  async getAverageQualityScore(userId: string, days = 7): Promise<number> {
    const { rows } = await pool.query<{ avg_score: string }>(
      `SELECT COALESCE(AVG(
         CASE sleep_quality
           WHEN 'poor'      THEN 1
           WHEN 'fair'      THEN 2
           WHEN 'good'      THEN 3
           WHEN 'excellent' THEN 4
           ELSE NULL
         END
       ), 0) AS avg_score
       FROM sleep_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '1 day' * $2`,
      [userId, days]
    );
    return Math.round(Number(rows[0].avg_score) * 10) / 10;
  }
}
