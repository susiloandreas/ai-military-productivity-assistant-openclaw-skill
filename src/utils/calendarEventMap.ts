import { CalendarEvent } from './googleCalendar';

/**
 * Pure helpers for turning a Google Calendar event into a calendar_events row.
 * No I/O — the #hashtag category parsing and time handling are unit-testable in
 * isolation from the Calendar API.
 */

export interface ParsedTitle {
  /** Title with all #hashtags removed and whitespace collapsed. */
  title: string;
  /** First hashtag, upper-cased (the category), or null when untagged. */
  category: string | null;
}

/**
 * Split a category out of an event title. The first #hashtag becomes the
 * (upper-cased) category; every hashtag is stripped from the displayed title.
 * "Meeting a #WORK" -> { title: 'Meeting a', category: 'WORK' }.
 */
export function parseCategoryTag(rawTitle: string): ParsedTitle {
  const tags = [...rawTitle.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(m => m[1]);
  const category = tags.length > 0 ? tags[0].toUpperCase() : null;
  const cleaned = rawTitle.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
  return { title: cleaned || rawTitle.trim(), category };
}

export interface CalendarEventRow {
  calendar_id: string;
  event_id: string;
  title: string;
  category: string | null;
  location: string | null;
  starts_at: string; // ISO timestamp
  ends_at: string | null;
  all_day: boolean;
  html_link: string | null;
}

/** ISO timestamp for an event edge. All-day uses `date` (UTC midnight); timed uses `dateTime`. */
function edgeToIso(edge: { date?: string; dateTime?: string } | undefined): string | null {
  if (!edge) return null;
  if (edge.dateTime) return new Date(edge.dateTime).toISOString();
  if (edge.date) return new Date(`${edge.date}T00:00:00Z`).toISOString();
  return null;
}

/**
 * Map a (singleEvents-expanded) Calendar event to a row, or null when it has no
 * usable start or title — those cannot be stored meaningfully.
 */
export function eventToRow(ev: CalendarEvent, calendarId: string): CalendarEventRow | null {
  if (!ev.id) return null;
  const startsAt = edgeToIso(ev.start);
  if (!startsAt) return null;
  const rawTitle = ev.summary?.trim();
  if (!rawTitle) return null;

  const { title, category } = parseCategoryTag(rawTitle);
  return {
    calendar_id: calendarId,
    event_id: ev.id,
    title,
    category,
    location: ev.location ?? null,
    starts_at: startsAt,
    ends_at: edgeToIso(ev.end),
    all_day: !!ev.start?.date && !ev.start?.dateTime,
    html_link: ev.htmlLink ?? null,
  };
}
