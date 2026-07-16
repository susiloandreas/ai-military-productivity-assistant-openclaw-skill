import { CalendarEventRepository } from '../repositories/CalendarEventRepository';
import { GoogleCalendarService } from './GoogleCalendarService';
import { listCalendars, listEventsInWindow } from '../utils/googleCalendar';
import { eventToRow } from '../utils/calendarEventMap';

const DAY_MS = 86_400_000;

export interface CalendarSyncOptions {
  /** How many days back to sync (default 7). */
  pastDays?: number;
  /** How many days forward to sync (default 90). */
  futureDays?: number;
}

export interface CalendarSyncResult {
  calendars: number;
  synced: number;
  pruned: number;
  byCategory: Record<string, number>;
  window: { from: string; to: string };
  errors: { calendar: string; message: string }[];
}

/**
 * Mirrors events from ALL of the user's Google calendars into calendar_events,
 * over a rolling time window (recurring series expanded to instances). Each
 * event's category is parsed from a #hashtag in its title. Idempotent: upserts
 * on (user, calendar, event) and prunes events deleted in Google within the
 * window. A per-calendar failure (e.g. no read access) is collected, not fatal.
 */
export class CalendarSyncService {
  constructor(
    private readonly events: CalendarEventRepository,
    private readonly calendar: GoogleCalendarService
  ) {}

  async syncAll(userId: string, opts: CalendarSyncOptions = {}): Promise<CalendarSyncResult> {
    const pastDays = opts.pastDays ?? 7;
    const futureDays = opts.futureDays ?? 90;
    const now = Date.now();
    const from = new Date(now - pastDays * DAY_MS).toISOString();
    const to = new Date(now + futureDays * DAY_MS).toISOString();

    const token = await this.calendar.getAccessToken(userId);
    const calendars = await listCalendars(token);

    const result: CalendarSyncResult = {
      calendars: calendars.length,
      synced: 0,
      pruned: 0,
      byCategory: {},
      window: { from, to },
      errors: [],
    };

    for (const cal of calendars) {
      try {
        const events = await listEventsInWindow(token, cal.id, from, to);
        const keep: string[] = [];
        for (const ev of events) {
          const row = eventToRow(ev, cal.id);
          if (!row) continue;
          await this.events.upsert(userId, row);
          keep.push(row.event_id);
          result.synced += 1;
          const key = row.category ?? 'UNTAGGED';
          result.byCategory[key] = (result.byCategory[key] ?? 0) + 1;
        }
        result.pruned += await this.events.deleteInWindowNotIn(userId, cal.id, from, to, keep);
      } catch (err) {
        result.errors.push({ calendar: cal.summary ?? cal.id, message: (err as Error).message });
      }
    }

    return result;
  }
}
