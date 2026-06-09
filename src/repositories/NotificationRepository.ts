import { pool } from '../db/connection';

/**
 * De-duplication log for proactive outbound notifications, so scheduled
 * messages (e.g. coaching at 07:00 / 13:00 / 23:00) are never sent twice and can
 * be checked against other recent notifications to avoid stacking.
 */
export class NotificationRepository {
  /**
   * Atomically claim a dedup key. Returns true if this caller won the claim
   * (i.e. it should send); false if the key was already recorded (skip).
   */
  async claim(userId: string, kind: string, dedupKey: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `INSERT INTO notification_log (user_id, kind, dedup_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      [userId, kind, dedupKey]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Whether a notification was sent for this user within the last N minutes,
   * optionally restricted to a single `kind`.
   */
  async sentWithinMinutes(userId: string, minutes: number, kind?: string): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM notification_log
         WHERE user_id = $1 AND sent_at >= NOW() - INTERVAL '1 minute' * $2
           AND ($3::text IS NULL OR kind = $3)
       ) AS exists`,
      [userId, minutes, kind ?? null]
    );
    return rows[0].exists;
  }

  /** Record a one-off (non-deduplicated) notification with a timestamped key. */
  async record(userId: string, kind: string): Promise<void> {
    await pool.query(
      `INSERT INTO notification_log (user_id, kind, dedup_key)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, kind, `${kind}:${Date.now()}`]
    );
  }
}
