import { CalendarEventRecord } from '../types';
import { CalendarEventInput } from '../utils/googleCalendar';

/**
 * Build the Google Calendar event for a just-started mission, or null when the
 * mission is already on the calendar (an existing event with the same title
 * overlaps its start — e.g. it was started from that event). Pure — no I/O — so
 * the dedupe + time/summary logic is unit-testable.
 */

interface MissionLike {
  title: string;
  started_at: Date | string;
  eta_minutes: number | null;
}

/** Block length (minutes) for an open-ended mission (no ETA). */
export const DEFAULT_MISSION_BLOCK_MIN = 30;

export function buildMissionCalendarEvent(
  mission: MissionLike,
  categoryName: string | null,
  existingEvents: CalendarEventRecord[],
  timeZone: string,
  defaultMinutes = DEFAULT_MISSION_BLOCK_MIN
): CalendarEventInput | null {
  const start = new Date(mission.started_at);
  const startMs = start.getTime();
  const titleLc = mission.title.trim().toLowerCase();

  const alreadyOnCalendar = existingEvents.some(e => {
    const s = new Date(e.starts_at).getTime();
    const end = e.ends_at ? new Date(e.ends_at).getTime() : s;
    const overlapsStart = s <= startMs && startMs < end;
    return overlapsStart && e.title.trim().toLowerCase() === titleLc;
  });
  if (alreadyOnCalendar) return null;

  const endMs = startMs + (mission.eta_minutes ?? defaultMinutes) * 60_000;
  // Carry the category as a #hashtag so the event round-trips through the sync
  // (which parses #TAG back into a category).
  const cleanCat = categoryName ? categoryName.replace(/[^\p{L}\p{N}_]/gu, '') : '';
  const summary = cleanCat ? `${mission.title} #${cleanCat}` : mission.title;

  return {
    summary,
    description: 'Auto-added from an Ironclaw mission.',
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: new Date(endMs).toISOString(), timeZone },
  };
}
