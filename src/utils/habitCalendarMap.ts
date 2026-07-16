/**
 * Pure mapping from a Google Calendar recurring event to the fields of a habit
 * schedule (name, expected time, weekdays). No I/O — kept pure so the RRULE and
 * time parsing are unit-testable in isolation from the Calendar API.
 */

/** iCalendar weekday codes → JS/Postgres day numbers (0=Sunday .. 6=Saturday). */
const ICAL_DAY: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export interface HabitEventShape {
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
}

export interface MappedSchedule {
  name: string;
  /** 'HH:MM:SS' wall-clock time from the event start. */
  expectedAt: string;
  /** 0=Sunday .. 6=Saturday, sorted & de-duped. */
  daysOfWeek: number[];
}

/** Extract the RRULE line (without prefix) from a recurrence array, or null. */
function findRrule(recurrence: string[] | undefined): string | null {
  if (!recurrence) return null;
  const line = recurrence.find(r => r.toUpperCase().startsWith('RRULE:'));
  return line ? line.slice(line.indexOf(':') + 1) : null;
}

/** Parse an RRULE body into { FREQ, BYDAY } (upper-cased keys). */
function parseRruleParts(rrule: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const kv of rrule.split(';')) {
    const [k, v] = kv.split('=');
    if (k && v) parts[k.trim().toUpperCase()] = v.trim();
  }
  return parts;
}

/** The wall-clock 'HH:MM:SS' from an RFC3339 dateTime, or null for all-day. */
export function wallClockTime(start: HabitEventShape['start']): string | null {
  if (!start?.dateTime) return null; // all-day (start.date) events have no time
  const m = start.dateTime.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
}

/** Weekday (0=Sun..6=Sat) of an event's start date, from the date portion only. */
function startWeekday(start: HabitEventShape['start']): number | null {
  const iso = start?.dateTime ?? start?.date;
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  // Use UTC noon to sidestep any DST/offset edge affecting the weekday.
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay();
}

/**
 * Resolve which weekdays a recurring event fires on:
 *  - FREQ=DAILY               → every day
 *  - FREQ=WEEKLY;BYDAY=MO,WE  → those days
 *  - FREQ=WEEKLY (no BYDAY)   → the event's own start weekday
 * Returns null for unsupported cadences (MONTHLY/YEARLY) or no recurrence, so
 * the caller skips them — a habit is a daily/weekly rhythm.
 */
export function recurrenceDays(
  recurrence: string[] | undefined,
  start: HabitEventShape['start']
): number[] | null {
  const rrule = findRrule(recurrence);
  if (!rrule) return null;
  const parts = parseRruleParts(rrule);

  if (parts.FREQ === 'DAILY') return [0, 1, 2, 3, 4, 5, 6];
  if (parts.FREQ !== 'WEEKLY') return null; // monthly/yearly aren't habit rhythms

  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',')
      .map(code => ICAL_DAY[code.replace(/^[+-]?\d+/, '').trim().toUpperCase()])
      .filter((n): n is number => n != null);
    return days.length ? [...new Set(days)].sort((a, b) => a - b) : null;
  }

  const dow = startWeekday(start); // weekly with no BYDAY → the start day
  return dow == null ? null : [dow];
}

/**
 * Map a Calendar event to habit-schedule fields, or null when it cannot be a
 * habit (no title, all-day/no time, or a non-daily/weekly recurrence).
 */
export function eventToSchedule(ev: HabitEventShape): MappedSchedule | null {
  const name = ev.summary?.trim();
  if (!name) return null;
  const expectedAt = wallClockTime(ev.start);
  if (!expectedAt) return null;
  const daysOfWeek = recurrenceDays(ev.recurrence, ev.start);
  if (!daysOfWeek || daysOfWeek.length === 0) return null;
  return { name, expectedAt, daysOfWeek };
}
