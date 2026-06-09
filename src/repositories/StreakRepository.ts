import { pool } from '../db/connection';
import { Streak } from '../types';

/**
 * Persistence for habit + overall streaks (the "chain"). One row per
 * (user, habit_type_id); the overall streak is the row with habit_type_id NULL.
 * The service layer owns the streak arithmetic — this class only reads and
 * upserts rows.
 */
export class StreakRepository {
  /** All streak rows for a user (per-habit rows + the overall row). */
  async getAll(userId: string): Promise<Streak[]> {
    const { rows } = await pool.query<Streak>(
      `SELECT user_id, habit_type_id, current_count, longest_count,
              to_char(last_logged_day, 'YYYY-MM-DD') AS last_logged_day
         FROM habit_streaks
        WHERE user_id = $1`,
      [userId]
    );
    return rows;
  }

  /** The overall streak row, or null if none exists yet. */
  async getOverall(userId: string): Promise<Streak | null> {
    const { rows } = await pool.query<Streak>(
      `SELECT user_id, habit_type_id, current_count, longest_count,
              to_char(last_logged_day, 'YYYY-MM-DD') AS last_logged_day
         FROM habit_streaks
        WHERE user_id = $1 AND habit_type_id IS NULL`,
      [userId]
    );
    return rows[0] ?? null;
  }

  /** A single per-habit streak row, or null if none exists yet. */
  async getHabit(userId: string, habitTypeId: string): Promise<Streak | null> {
    const { rows } = await pool.query<Streak>(
      `SELECT user_id, habit_type_id, current_count, longest_count,
              to_char(last_logged_day, 'YYYY-MM-DD') AS last_logged_day
         FROM habit_streaks
        WHERE user_id = $1 AND habit_type_id = $2`,
      [userId, habitTypeId]
    );
    return rows[0] ?? null;
  }

  /**
   * Upsert a streak's counts and last-logged day. `habitTypeId === null` targets
   * the overall row. Conflicts resolve on the partial unique indexes (per-habit
   * vs overall), so the matching row is updated in place.
   */
  async upsert(
    userId: string,
    habitTypeId: string | null,
    current: number,
    longest: number,
    lastLoggedDay: string | null
  ): Promise<void> {
    const conflictTarget =
      habitTypeId === null ? '(user_id) WHERE habit_type_id IS NULL' : '(user_id, habit_type_id) WHERE habit_type_id IS NOT NULL';
    await pool.query(
      `INSERT INTO habit_streaks (user_id, habit_type_id, current_count, longest_count, last_logged_day, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET current_count = EXCLUDED.current_count,
                     longest_count = EXCLUDED.longest_count,
                     last_logged_day = EXCLUDED.last_logged_day,
                     updated_at = NOW()`,
      [userId, habitTypeId, current, longest, lastLoggedDay]
    );
  }
}
