import { CalendarEventRecord } from '../types';

/**
 * Mission-start conflict detection against the mirrored Google Calendar. A new
 * mission "conflicts" when a calendar event is either in progress right now, or
 * starts before the mission's ETA would end ("now or starting soon"). Pure — no
 * I/O — so the window arithmetic is unit-testable.
 */

/** Lookahead when the mission has no ETA (so "starting soon" still has a window). */
export const DEFAULT_LOOKAHEAD_MIN = 30;

export interface ConflictingEvent {
  event: CalendarEventRecord;
  status: 'ongoing' | 'soon';
  /** Minutes until the event starts; 0 when already ongoing. */
  minutesUntilStart: number;
}

export function findConflictingEvents(
  events: CalendarEventRecord[],
  now: Date,
  etaMinutes: number | null
): ConflictingEvent[] {
  const nowMs = now.getTime();
  const windowEnd = nowMs + (etaMinutes ?? DEFAULT_LOOKAHEAD_MIN) * 60_000;

  const conflicts: ConflictingEvent[] = [];
  for (const e of events) {
    if (e.all_day) continue; // all-day events aren't a time-specific clash
    const start = new Date(e.starts_at).getTime();
    const end = e.ends_at ? new Date(e.ends_at).getTime() : start;

    if (start <= nowMs && nowMs < end) {
      conflicts.push({ event: e, status: 'ongoing', minutesUntilStart: 0 });
    } else if (start >= nowMs && start <= windowEnd) {
      conflicts.push({ event: e, status: 'soon', minutesUntilStart: Math.round((start - nowMs) / 60_000) });
    }
  }

  return conflicts.sort(
    (a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime()
  );
}
