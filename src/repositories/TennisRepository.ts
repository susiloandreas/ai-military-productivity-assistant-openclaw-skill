import { pool } from '../db/connection';
import { TennisTrainingLog, TennisSessionType } from '../types';

export class TennisRepository {
  async create(
    userId: string,
    sessionType: TennisSessionType,
    durationMinutes: number,
    missionId: string | null,
    notes?: string
  ): Promise<TennisTrainingLog> {
    const { rows } = await pool.query<TennisTrainingLog>(
      `INSERT INTO tennis_training_logs (user_id, session_type, duration_minutes, mission_id, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, sessionType, durationMinutes, missionId, notes ?? null]
    );
    return rows[0];
  }

  async getWeeklySummary(
    userId: string
  ): Promise<{ session_type: string; total_minutes: number; session_count: number }[]> {
    const { rows } = await pool.query(
      `SELECT session_type,
              COALESCE(SUM(duration_minutes), 0) AS total_minutes,
              COUNT(*) AS session_count
       FROM tennis_training_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days'
       GROUP BY session_type
       ORDER BY total_minutes DESC`,
      [userId]
    );
    return rows;
  }

  async getRecentLogs(userId: string, days = 14): Promise<TennisTrainingLog[]> {
    const { rows } = await pool.query<TennisTrainingLog>(
      `SELECT * FROM tennis_training_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY logged_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async getWeeklyTotalMinutes(userId: string): Promise<number> {
    const { rows } = await pool.query<{ total: number }>(
      `SELECT COALESCE(SUM(duration_minutes), 0) AS total
       FROM tennis_training_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days'`,
      [userId]
    );
    return Number(rows[0].total);
  }

  async getLastSessionDate(userId: string): Promise<Date | null> {
    const { rows } = await pool.query<{ logged_at: Date }>(
      `SELECT logged_at FROM tennis_training_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0]?.logged_at ?? null;
  }
}
