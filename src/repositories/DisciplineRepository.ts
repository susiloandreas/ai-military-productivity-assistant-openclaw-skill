import { pool } from '../db/connection';
import { DisciplineScore } from '../types';

export class DisciplineRepository {
  async saveScore(userId: string, scoreData: Omit<DisciplineScore, 'id' | 'user_id' | 'calculated_at'>): Promise<DisciplineScore> {
    const { rows } = await pool.query<DisciplineScore>(
      `INSERT INTO discipline_scores
         (user_id, score, mission_consistency, sleep_consistency, focus_duration,
          estimation_accuracy, completion_rate, wake_consistency, habit_adherence,
          goal_adherence, distraction_frequency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        userId,
        scoreData.score,
        scoreData.mission_consistency ?? null,
        scoreData.sleep_consistency ?? null,
        scoreData.focus_duration ?? null,
        scoreData.estimation_accuracy ?? null,
        scoreData.completion_rate ?? null,
        scoreData.wake_consistency ?? null,
        scoreData.habit_adherence ?? null,
        scoreData.goal_adherence ?? null,
        scoreData.distraction_frequency ?? null,
      ]
    );
    return rows[0];
  }

  async getLatestScore(userId: string): Promise<DisciplineScore | null> {
    const { rows } = await pool.query<DisciplineScore>(
      `SELECT * FROM discipline_scores WHERE user_id = $1 ORDER BY calculated_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async getScoreHistory(userId: string, days = 30): Promise<DisciplineScore[]> {
    const { rows } = await pool.query<DisciplineScore>(
      `SELECT * FROM discipline_scores
       WHERE user_id = $1 AND calculated_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY calculated_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async getAverageScore(userId: string, days = 7): Promise<number> {
    const { rows } = await pool.query<{ avg_score: number }>(
      `SELECT COALESCE(AVG(score), 0) AS avg_score
       FROM discipline_scores
       WHERE user_id = $1 AND calculated_at >= NOW() - INTERVAL '1 day' * $2`,
      [userId, days]
    );
    return Math.round(Number(rows[0].avg_score) * 10) / 10;
  }
}
