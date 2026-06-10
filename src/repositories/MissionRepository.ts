import { pool } from '../db/connection';
import { Mission, MissionStatus } from '../types';

export class MissionRepository {
  async create(
    userId: string,
    title: string,
    habitCategoryId: string | null,
    etaMinutes: number | null,
    habitTypeId: string | null = null
  ): Promise<Mission> {
    const { rows } = await pool.query<Mission>(
      `INSERT INTO missions (user_id, title, habit_category_id, habit_type_id, eta_minutes, mode)
       VALUES ($1, $2, $3, $4, $5, 'live') RETURNING *`,
      [userId, title, habitCategoryId, habitTypeId, etaMinutes]
    );
    return rows[0];
  }

  /**
   * A retroactive mission: an activity that already happened, recorded after the fact.
   * Created already 'completed' so it advances goals and counts toward habit adherence,
   * but never enters the live timer / ETA-expiry flow.
   */
  async createRetroactive(
    userId: string,
    title: string,
    habitCategoryId: string,
    habitTypeId: string,
    durationMinutes: number,
    note: string | null
  ): Promise<Mission> {
    const { rows } = await pool.query<Mission>(
      `INSERT INTO missions
         (user_id, title, habit_category_id, habit_type_id, status, mode,
          completed_at, actual_duration_minutes, notes)
       VALUES ($1, $2, $3, $4, 'completed', 'retroactive', NOW(), $5, $6)
       RETURNING *`,
      [userId, title, habitCategoryId, habitTypeId, durationMinutes, note]
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

  /** Missions currently on hold (paused), most-recently-held first. */
  async getHeld(userId: string): Promise<Mission[]> {
    const { rows } = await pool.query<Mission>(
      `SELECT * FROM missions WHERE user_id = $1 AND status = 'paused'
       ORDER BY paused_at DESC NULLS LAST, started_at DESC`,
      [userId]
    );
    return rows;
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

  /**
   * Revive an ETA-expired mission: flip it back to 'active', clear the
   * awaiting-notes flag, and set its total ETA so the timer can be restarted.
   */
  async reviveWithEta(id: string, etaMinutes: number): Promise<Mission> {
    const { rows } = await pool.query<Mission>(
      `UPDATE missions SET status = 'active', awaiting_notes = FALSE, eta_minutes = $2
       WHERE id = $1 RETURNING *`,
      [id, etaMinutes]
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

  /** Returns missions started or completed within the last `minutes` minutes. */
  async getActivitySince(userId: string, minutes: number): Promise<Mission[]> {
    const { rows } = await pool.query<Mission>(
      `SELECT * FROM missions
       WHERE user_id = $1
         AND (started_at >= NOW() - INTERVAL '1 minute' * $2
              OR completed_at >= NOW() - INTERVAL '1 minute' * $2)
       ORDER BY started_at DESC`,
      [userId, minutes]
    );
    return rows;
  }

  /**
   * Mark an active mission as ETA-expired and flag it for a notes follow-up.
   * Returns the updated mission, or null if it was no longer active (e.g. already
   * completed or aborted before the timer fired).
   */
  async markEtaExpired(id: string): Promise<Mission | null> {
    const { rows } = await pool.query<Mission>(
      `UPDATE missions SET status = 'eta_expired', awaiting_notes = TRUE
       WHERE id = $1 AND status = 'active' RETURNING *`,
      [id]
    );
    return rows[0] ?? null;
  }

  /** The most recent mission waiting for a "what did you do?" reply, if any. */
  async getAwaitingNotes(userId: string): Promise<Mission | null> {
    const { rows } = await pool.query<Mission>(
      `SELECT * FROM missions
       WHERE user_id = $1 AND awaiting_notes = TRUE
       ORDER BY COALESCE(completed_at, started_at) DESC LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async setAwaitingNotes(id: string, value: boolean): Promise<void> {
    await pool.query(`UPDATE missions SET awaiting_notes = $2 WHERE id = $1`, [id, value]);
  }

  /** Append the user's reply to notes and clear the awaiting flag. */
  async appendNotes(id: string, notes: string): Promise<Mission> {
    const { rows } = await pool.query<Mission>(
      `UPDATE missions
       SET notes = CASE
             WHEN notes IS NULL OR notes = '' THEN $2
             ELSE notes || E'\n' || $2
           END,
           awaiting_notes = FALSE
       WHERE id = $1 RETURNING *`,
      [id, notes]
    );
    return rows[0];
  }

  /** Habit type ids the user has logged a mission for on or after `since` (used for "logged today"). */
  async getHabitTypeIdsLoggedSince(userId: string, since: Date): Promise<string[]> {
    const { rows } = await pool.query<{ habit_type_id: string }>(
      `SELECT DISTINCT habit_type_id FROM missions
       WHERE user_id = $1 AND habit_type_id IS NOT NULL
         AND (started_at >= $2 OR completed_at >= $2)`,
      [userId, since]
    );
    return rows.map(r => r.habit_type_id);
  }

  /** Habit type ids logged within [start, end) — used for "logged yesterday". */
  async getHabitTypeIdsLoggedBetween(userId: string, start: Date, end: Date): Promise<string[]> {
    const { rows } = await pool.query<{ habit_type_id: string }>(
      `SELECT DISTINCT habit_type_id FROM missions
       WHERE user_id = $1 AND habit_type_id IS NOT NULL
         AND ((started_at >= $2 AND started_at < $3)
              OR (completed_at >= $2 AND completed_at < $3))`,
      [userId, start, end]
    );
    return rows.map(r => r.habit_type_id);
  }

  /** 7-day total of retroactively-logged minutes per habit category (drives /habit summary). */
  async getWeeklyCategorySummary(
    userId: string
  ): Promise<{ habit_category_id: string; name: string; total_minutes: number }[]> {
    const { rows } = await pool.query(
      `SELECT hc.id AS habit_category_id, hc.name,
              COALESCE(SUM(m.actual_duration_minutes), 0) AS total_minutes
       FROM habit_categories hc
       LEFT JOIN missions m ON m.habit_category_id = hc.id
         AND m.mode = 'retroactive'
         AND m.completed_at >= NOW() - INTERVAL '7 days'
       WHERE hc.user_id = $1
       GROUP BY hc.id, hc.name
       ORDER BY hc.name`,
      [userId]
    );
    return rows;
  }
}
