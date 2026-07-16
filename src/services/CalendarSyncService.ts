import { CalendarEventRepository } from '../repositories/CalendarEventRepository';
import { GoogleCalendarService } from './GoogleCalendarService';
import { listCalendars, listEventsInWindow } from '../utils/googleCalendar';
import { eventToRow } from '../utils/calendarEventMap';
import { zonedTodayWindow } from '../utils/timeWindow';

export interface CalendarSyncResult {
  calendars: number;
  synced: number;
  pruned: number;
  byCategory: Record<string, number>;
  window: { from: string; to: string };
  errors: { calendar: string; message: string }[];
  /**
   * Order-independent fingerprint of the synced event set (id + start + title +
   * category). Lets a caller send a notification only when the calendar actually
   * changed since the previous sync.
   */
  signature: string;
}

/**
 * Mirrors TODAY's events from ALL of the user's Google calendars into
 * calendar_events (recurring series expanded to instances). "Today" is the local
 * calendar day in the app timezone. Each event's category is parsed from a
 * #hashtag in its title. Idempotent: upserts on (user, calendar, event), prunes
 * events removed in Google, and drops any mirrored event outside today so the
 * mirror stays scoped to the current day. A per-calendar failure is collected,
 * not fatal.
 */
export class CalendarSyncService {
  constructor(
    private readonly events: CalendarEventRepository,
    private readonly calendar: GoogleCalendarService
  ) {}

  async syncAll(userId: string): Promise<CalendarSyncResult> {
    const tz = process.env.TZ || 'Asia/Jakarta';
    const { from, to } = zonedTodayWindow(new Date(), tz);

    const token = await this.calendar.getAccessToken(userId);
    const calendars = await listCalendars(token);

    const result: CalendarSyncResult = {
      calendars: calendars.length,
      synced: 0,
      pruned: 0,
      byCategory: {},
      window: { from, to },
      errors: [],
      signature: '',
    };
    const sigParts: string[] = [];

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
          sigParts.push(`${row.event_id}|${row.starts_at}|${row.title}|${row.category ?? ''}`);
        }
        result.pruned += await this.events.deleteInWindowNotIn(userId, cal.id, from, to, keep);
      } catch (err) {
        result.errors.push({ calendar: cal.summary ?? cal.id, message: (err as Error).message });
      }
    }

    // Keep the mirror scoped to today: drop leftovers from earlier wider syncs.
    result.pruned += await this.events.keepOnlyWindow(userId, from, to);
    result.signature = sigParts.sort().join('\n');

    return result;
  }
}
