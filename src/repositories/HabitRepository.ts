import { pool } from '../db/connection';
import { HabitCategory, HabitType, HabitLog } from '../types';

export class HabitRepository {
  // ── Categories ──────────────────────────────────────────────────────────

  async createCategory(userId: string, name: string, description?: string): Promise<HabitCategory> {
    const { rows } = await pool.query<HabitCategory>(
      `INSERT INTO habit_categories (user_id, name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, name, description ?? null]
    );
    return rows[0];
  }

  async getCategoryByName(userId: string, name: string): Promise<HabitCategory | null> {
    const { rows } = await pool.query<HabitCategory>(
      `SELECT * FROM habit_categories WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
      [userId, name]
    );
    return rows[0] ?? null;
  }

  async getCategoryById(id: string): Promise<HabitCategory | null> {
    const { rows } = await pool.query<HabitCategory>(
      `SELECT * FROM habit_categories WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async getAllCategories(userId: string): Promise<HabitCategory[]> {
    const { rows } = await pool.query<HabitCategory>(
      `SELECT * FROM habit_categories WHERE user_id = $1 ORDER BY name`,
      [userId]
    );
    return rows;
  }

  // ── Habit Types ─────────────────────────────────────────────────────────

  async upsertHabitType(habitCategoryId: string, name: string, unit = 'minutes'): Promise<HabitType> {
    const { rows } = await pool.query<HabitType>(
      `INSERT INTO habit_types (habit_category_id, name, unit)
       VALUES ($1, $2, $3)
       ON CONFLICT (habit_category_id, name) DO UPDATE SET unit = EXCLUDED.unit
       RETURNING *`,
      [habitCategoryId, name, unit]
    );
    return rows[0];
  }

  async getHabitTypeByName(habitCategoryId: string, name: string): Promise<HabitType | null> {
    const { rows } = await pool.query<HabitType>(
      `SELECT * FROM habit_types WHERE habit_category_id = $1 AND LOWER(name) = LOWER($2)`,
      [habitCategoryId, name]
    );
    return rows[0] ?? null;
  }

  // ── Habit Logs ──────────────────────────────────────────────────────────

  async createLog(
    userId: string,
    habitTypeId: string,
    durationMinutes: number,
    note?: string
  ): Promise<HabitLog> {
    const { rows } = await pool.query<HabitLog>(
      `INSERT INTO habit_logs (user_id, habit_type_id, duration_minutes, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, habitTypeId, durationMinutes, note ?? null]
    );
    return rows[0];
  }

  async getRecentLogs(userId: string, days = 7): Promise<HabitLog[]> {
    const { rows } = await pool.query<HabitLog>(
      `SELECT * FROM habit_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY logged_at DESC`,
      [userId, days]
    );
    return rows;
  }

  /** Returns habit logs created within the last `minutes` minutes. */
  async getLogsSince(userId: string, minutes: number): Promise<HabitLog[]> {
    const { rows } = await pool.query<HabitLog>(
      `SELECT * FROM habit_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '1 minute' * $2
       ORDER BY logged_at DESC`,
      [userId, minutes]
    );
    return rows;
  }

  async getWeeklySummary(
    userId: string
  ): Promise<{ habit_category_id: string; name: string; total_minutes: number }[]> {
    const { rows } = await pool.query(
      `SELECT hc.id AS habit_category_id, hc.name, COALESCE(SUM(hl.duration_minutes), 0) AS total_minutes
       FROM habit_categories hc
       LEFT JOIN habit_types ht ON ht.habit_category_id = hc.id
       LEFT JOIN habit_logs hl ON hl.habit_type_id = ht.id
         AND hl.logged_at >= NOW() - INTERVAL '7 days'
       WHERE hc.user_id = $1
       GROUP BY hc.id, hc.name
       ORDER BY hc.name`,
      [userId]
    );
    return rows;
  }
}
