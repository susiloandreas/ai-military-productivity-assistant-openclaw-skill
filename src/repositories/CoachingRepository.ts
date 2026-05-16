import { pool } from '../db/connection';
import { CoachingFeedback, CoachingInsight } from '../types';

export class CoachingRepository {
  async save(userId: string, insight: CoachingInsight): Promise<CoachingFeedback> {
    const { rows } = await pool.query<CoachingFeedback>(
      `INSERT INTO coaching_feedback (user_id, category, rule_triggered, message, severity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, insight.category, insight.rule, insight.message, insight.severity]
    );
    return rows[0];
  }

  async getRecent(userId: string, days = 7): Promise<CoachingFeedback[]> {
    const { rows } = await pool.query<CoachingFeedback>(
      `SELECT * FROM coaching_feedback
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY created_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async getByCategory(userId: string, category: string, limit = 5): Promise<CoachingFeedback[]> {
    const { rows } = await pool.query<CoachingFeedback>(
      `SELECT * FROM coaching_feedback
       WHERE user_id = $1 AND category = $2
       ORDER BY created_at DESC LIMIT $3`,
      [userId, category, limit]
    );
    return rows;
  }
}
