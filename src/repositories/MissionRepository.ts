import { pool } from '../db/connection';
import { Mission, MissionStatus } from '../types';

export class MissionRepository {
  async create(
    userId: string,
    title: string,
    habitCategoryId: string | null,
    etaMinutes: number | null
  ): Promise<Mission> {
    const { rows } = await pool.query<Mission>(
      `INSERT INTO missions (user_id, title, habit_category_id, eta_minutes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, title, habitCategoryId, etaMinutes]
    );
    return rows[0];
  }

  async getActive(userId: string): Promise<Mission | null> {
    const { rows } = await pool.query<Mission>(
      `SELECT * FROM missions WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async getById(id: string): Promise<Mission | null> {
    const { rows } = await pool.query<Mission>('SELECT * FROM missions WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async updateStatus(id: string, status: MissionStatus, extra: Partial<Mission> = {}): Promise<Mission> {
    const fields: string[] = ['status = $2'];
    const values: unknown[] = [id, status];
    let idx = 3;

    if (status === 'completed') {
      fields.push(`completed_at = NOW()`);
    }
    if (status === 'paused') {
      fields.push(`paused_at = NOW()`);
    }
    if (extra.actual_duration_minutes !== undefined) {
      fields.push(`actual_duration_minutes = $${idx++}`);
      values.push(extra.actual_duration_minutes);
    }
    if (extra.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(extra.notes);
    }

    const { rows } = await pool.query<Mission>(
      `UPDATE missions SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    return rows[0];
  }

  async extendEta(id: string, additionalMinutes: number): Promise<Mission> {
    const { rows } = await pool.query<Mission>(
      `UPDATE missions SET eta_minutes = COALESCE(eta_minutes, 0) + $2 WHERE id = $1 RETURNING *`,
      [id, additionalMinutes]
    );
    return rows[0];
  }

  async getRecentCompleted(userId: string, days = 7): Promise<Mission[]> {
    const { rows } = await pool.query<Mission>(
      `SELECT * FROM missions
       WHERE user_id = $1 AND status = 'completed'
         AND completed_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY completed_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async getRecentAll(userId: string, days = 7): Promise<Mission[]> {
    const { rows } = await pool.query<Mission>(
      `SELECT * FROM missions
       WHERE user_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY started_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async markEtaExpired(id: string): Promise<void> {
    await pool.query(
      `UPDATE missions SET status = 'eta_expired' WHERE id = $1 AND status = 'active'`,
      [id]
    );
  }
}
