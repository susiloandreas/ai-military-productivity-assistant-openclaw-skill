import https from 'https';

/**
 * Minimal Google Calendar v3 REST client — raw https, no SDK, mirroring the
 * other utils. Each call takes an already-valid access token (the service layer
 * owns refreshing) and talks to the Calendar API directly.
 */

const API_HOST = 'www.googleapis.com';

/** A calendar time — either an all-day date or a timed dateTime (with timeZone). */
export interface CalendarEventTime {
  date?: string; // YYYY-MM-DD for all-day events
  dateTime?: string; // RFC3339, e.g. 2026-07-16T09:00:00+07:00
  timeZone?: string; // IANA tz, e.g. Asia/Jakarta
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  location?: string;
}

export interface CalendarEvent extends CalendarEventInput {
  id: string;
  htmlLink?: string;
  status?: string;
  /** RRULE/EXDATE lines for a recurring event master (present when singleEvents=false). */
  recurrence?: string[];
}

/** A single authorized JSON request to the Calendar API. */
function request<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: API_HOST,
      path,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {}),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`Calendar API error: HTTP ${status} ${data.slice(0, 300)}`));
          return;
        }
        if (!data) {
          resolve(undefined as T); // e.g. 204 from a delete
          return;
        }
        try {
          resolve(JSON.parse(data) as T);
        } catch (err) {
          reject(new Error(`Calendar API parse error: ${(err as Error).message}`));
        }
      });
    });

    req.setTimeout(30000, () => req.destroy(new Error('Calendar API request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Create an event on the given calendar (default 'primary'). */
export function insertEvent(
  accessToken: string,
  event: CalendarEventInput,
  calendarId = 'primary'
): Promise<CalendarEvent> {
  return request<CalendarEvent>(
    accessToken,
    'POST',
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    event
  );
}

/** A calendar in the user's calendar list. */
export interface CalendarListEntry {
  id: string;
  summary?: string;
}

/** Create a new secondary calendar; returns its id. */
export function createCalendar(accessToken: string, summary: string): Promise<CalendarListEntry> {
  return request<CalendarListEntry>(accessToken, 'POST', '/calendar/v3/calendars', { summary });
}

/** Every calendar in the user's calendar list. */
export function listCalendars(accessToken: string): Promise<CalendarListEntry[]> {
  return request<{ items?: CalendarListEntry[] }>(
    accessToken,
    'GET',
    '/calendar/v3/users/me/calendarList?maxResults=250&showHidden=true'
  ).then(res => res.items ?? []);
}

/**
 * List every event on a calendar between timeMin and timeMax (ISO strings),
 * expanding recurring series into concrete instances (singleEvents=true) and
 * following pagination to completion.
 */
export async function listEventsInWindow(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: '250',
      timeMin,
      timeMax,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await request<{ items?: CalendarEvent[]; nextPageToken?: string }>(
      accessToken,
      'GET',
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    );
    for (const e of page.items ?? []) if (e.status !== 'cancelled') events.push(e);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

/** Find a calendar the user owns by its exact summary (case-insensitive), or null. */
export function findCalendarBySummary(
  accessToken: string,
  summary: string
): Promise<CalendarListEntry | null> {
  return request<{ items?: CalendarListEntry[] }>(
    accessToken,
    'GET',
    '/calendar/v3/users/me/calendarList?maxResults=250&showHidden=true'
  ).then(res => res.items?.find(c => c.summary?.toLowerCase() === summary.toLowerCase()) ?? null);
}

/**
 * List the recurring-event masters on a calendar. singleEvents=false returns
 * each recurring series once, carrying its `recurrence` RRULE (what the habit
 * sync needs) rather than expanding it into individual instances.
 */
export function listRecurringMasters(
  accessToken: string,
  calendarId: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: 'false',
    showDeleted: 'false',
    maxResults: '250',
  });
  return request<{ items?: CalendarEvent[] }>(
    accessToken,
    'GET',
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  ).then(res => (res.items ?? []).filter(e => e.status !== 'cancelled'));
}

/** List upcoming events (timeMin = now), soonest first. */
export function listUpcomingEvents(
  accessToken: string,
  maxResults = 10,
  calendarId = 'primary'
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  return request<{ items?: CalendarEvent[] }>(
    accessToken,
    'GET',
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  ).then(res => res.items ?? []);
}
