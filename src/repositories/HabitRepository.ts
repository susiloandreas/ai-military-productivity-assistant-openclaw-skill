import { pool } from '../db/connection';
import { HabitCategory, HabitType, HabitSchedule, HabitScheduleWithNames } from '../types';

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

  async getHabitTypeById(id: string): Promise<HabitType | null> {
    const { rows } = await pool.query<HabitType>(
      `SELECT * FROM habit_types WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async getHabitTypeByName(habitCategoryId: string, name: string): Promise<HabitType | null> {
    const { rows } = await pool.query<HabitType>(
      `SELECT * FROM habit_types WHERE habit_category_id = $1 AND LOWER(name) = LOWER($2)`,
      [habitCategoryId, name]
    );
    return rows[0] ?? null;
  }

  /** Find a habit type by name across all the user's categories (case-insensitive), or null. */
  async findHabitTypeByName(userId: string, name: string): Promise<HabitType | null> {
    const { rows } = await pool.query<HabitType>(
      `SELECT ht.* FROM habit_types ht
         JOIN habit_categories hc ON hc.id = ht.habit_category_id
        WHERE hc.user_id = $1 AND LOWER(ht.name) = LOWER($2)
        LIMIT 1`,
      [userId, name]
    );
    return rows[0] ?? null;
  }

  // ── Habit Schedules ───────────────────────────────────────────────────────

  async createSchedule(
    userId: string,
    habitTypeId: string,
    expectedAt: string,
    daysOfWeek: number[],
    graceMinutes = 90
  ): Promise<HabitSchedule> {
    const { rows } = await pool.query<HabitSchedule>(
      `INSERT INTO habit_schedules (user_id, habit_type_id, expected_at, days_of_week, grace_minutes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, habitTypeId, expectedAt, daysOfWeek, graceMinutes]
    );
    return rows[0];
  }

  /** Active schedules with their habit type + category names, for the reminder check. */
  async getActiveSchedules(userId: string): Promise<HabitScheduleWithNames[]> {
    const { rows } = await pool.query<HabitScheduleWithNames>(
      `SELECT hs.*, ht.name AS habit_type_name, hc.name AS category_name
       FROM habit_schedules hs
       JOIN habit_types ht ON ht.id = hs.habit_type_id
       JOIN habit_categories hc ON hc.id = ht.habit_category_id
       WHERE hs.user_id = $1 AND hs.active = TRUE
       ORDER BY hs.expected_at`,
      [userId]
    );
    return rows;
  }
}
