import { pool } from '../db/connection';
import { CalendarEventRecord } from '../types';
import { CalendarEventRow } from '../utils/calendarEventMap';

/** Filters for reading mirrored calendar events back out. */
export interface CalendarEventQuery {
  from?: string; // ISO lower bound on starts_at
  to?: string;   // ISO upper bound on starts_at
  category?: string;
  limit?: number;
}

/**
 * Persistence for the Google Calendar mirror (calendar_events). The sync service
 * owns the fetch/parse; this class only upserts rows and prunes ones that vanished
 * from Google within the synced window.
 */
export class CalendarEventRepository {
  /** Upsert one event row, keyed on (user, calendar, event id). */
  async upsert(userId: string, row: CalendarEventRow): Promise<void> {
    await pool.query(
      `INSERT INTO calendar_events
         (user_id, calendar_id, event_id, title, category, location,
          starts_at, ends_at, all_day, html_link, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
       ON CONFLICT (user_id, calendar_id, event_id)
       DO UPDATE SET title = EXCLUDED.title,
                     category = EXCLUDED.category,
                     location = EXCLUDED.location,
                     starts_at = EXCLUDED.starts_at,
                     ends_at = EXCLUDED.ends_at,
                     all_day = EXCLUDED.all_day,
                     html_link = EXCLUDED.html_link,
                     updated_at = NOW()`,
      [
        userId, row.calendar_id, row.event_id, row.title, row.category, row.location,
        row.starts_at, row.ends_at, row.all_day, row.html_link,
      ]
    );
  }

  /**
   * Delete events on a calendar that start within [windowStart, windowEnd] but
   * are not in `keepEventIds` — i.e. they were deleted in Google since last sync.
   * Returns the number pruned.
   */
  async deleteInWindowNotIn(
    userId: string,
    calendarId: string,
    windowStart: string,
    windowEnd: string,
    keepEventIds: string[]
  ): Promise<number> {
    const { rowCount } = await pool.query(
      `DELETE FROM calendar_events
        WHERE user_id = $1 AND calendar_id = $2
          AND starts_at >= $3 AND starts_at <= $4
          AND NOT (event_id = ANY($5::text[]))`,
      [userId, calendarId, windowStart, windowEnd, keepEventIds]
    );
    return rowCount ?? 0;
  }

  /**
   * Delete every mirrored event that starts outside [from, to] — used to keep the
   * mirror scoped to a single day when syncing today-only. Returns rows removed.
   */
  async keepOnlyWindow(userId: string, from: string, to: string): Promise<number> {
    const { rowCount } = await pool.query(
      `DELETE FROM calendar_events
        WHERE user_id = $1 AND (starts_at < $2 OR starts_at > $3)`,
      [userId, from, to]
    );
    return rowCount ?? 0;
  }

  /** Read mirrored events, filtered and ordered by start time ascending. */
  async list(userId: string, q: CalendarEventQuery = {}): Promise<CalendarEventRecord[]> {
    const clauses = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (q.from) { params.push(q.from); clauses.push(`starts_at >= $${params.length}`); }
    if (q.to) { params.push(q.to); clauses.push(`starts_at <= $${params.length}`); }
    if (q.category) { params.push(q.category.toUpperCase()); clauses.push(`category = $${params.length}`); }
    params.push(Math.min(q.limit ?? 100, 500));
    const { rows } = await pool.query<CalendarEventRecord>(
      `SELECT * FROM calendar_events
        WHERE ${clauses.join(' AND ')}
        ORDER BY starts_at ASC
        LIMIT $${params.length}`,
      params
    );
    return rows;
  }
}
