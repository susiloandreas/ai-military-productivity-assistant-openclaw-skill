import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';
import {
  GoogleOAuthConfig,
  buildConsentUrl,
  exchangeCodeForTokens,
  loadGoogleOAuthConfig,
  refreshAccessToken,
} from '../utils/googleOAuth';
import {
  CalendarEvent,
  CalendarEventInput,
  createCalendar,
  findCalendarBySummary,
  insertEvent,
  listRecurringMasters,
  listUpcomingEvents,
} from '../utils/googleCalendar';

/** Name of the dedicated calendar whose events are treated as habits. */
export const HABIT_CALENDAR_NAME = 'Ironclaw Habits';

/** Refresh a little before the real expiry so an in-flight call never races it. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Orchestrates the Google Calendar integration: the OAuth handshake (consent URL
 * → code exchange), transparent access-token refresh, and the Calendar calls the
 * app actually makes. Config is loaded lazily so the server boots even when the
 * Google env vars are absent — only using the feature surfaces the error.
 */
export class GoogleCalendarService {
  private cfg: GoogleOAuthConfig | null = null;

  constructor(private readonly tokens: GoogleTokenRepository) {}

  private config(): GoogleOAuthConfig {
    if (!this.cfg) this.cfg = loadGoogleOAuthConfig();
    return this.cfg;
  }

  /** URL to redirect the user to for consent. `state` carries the user id back. */
  getAuthUrl(userId: string): string {
    return buildConsentUrl(this.config(), userId);
  }

  /** Whether the user has completed the OAuth handshake (has a refresh token). */
  async isConnected(userId: string): Promise<boolean> {
    const row = await this.tokens.get(userId);
    return !!row?.refresh_token;
  }

  /**
   * Handle the OAuth callback: exchange the code for tokens and persist them.
   * `state` is the user id we set on the consent URL. Returns the granted scope.
   */
  async handleCallback(code: string, userId: string): Promise<string> {
    const res = await exchangeCodeForTokens(this.config(), code);
    await this.tokens.upsert(userId, {
      access_token: res.access_token,
      refresh_token: res.refresh_token ?? null, // COALESCE-preserved in the repo
      scope: res.scope ?? null,
      token_type: res.token_type ?? null,
      expiry_date: Date.now() + res.expires_in * 1000,
    });
    return res.scope ?? '';
  }

  /**
   * Return a valid access token for the user, refreshing it if it is missing or
   * within EXPIRY_SKEW_MS of expiring. Throws if the user has not connected.
   */
  async getAccessToken(userId: string): Promise<string> {
    const row = await this.tokens.get(userId);
    if (!row?.refresh_token) {
      throw new Error('Google Calendar not connected for this user. Visit /auth/google to authorize.');
    }

    const fresh = row.access_token && row.expiry_date && row.expiry_date - EXPIRY_SKEW_MS > Date.now();
    if (fresh) return row.access_token as string;

    const res = await refreshAccessToken(this.config(), row.refresh_token);
    const expiry = Date.now() + res.expires_in * 1000;
    await this.tokens.updateAccessToken(userId, res.access_token, expiry);
    return res.access_token;
  }

  /** Create a Calendar event on the user's primary calendar. */
  async createEvent(userId: string, event: CalendarEventInput): Promise<CalendarEvent> {
    const token = await this.getAccessToken(userId);
    return insertEvent(token, event);
  }

  /** List the user's upcoming events, soonest first. */
  async listUpcoming(userId: string, maxResults = 10): Promise<CalendarEvent[]> {
    const token = await this.getAccessToken(userId);
    return listUpcomingEvents(token, maxResults);
  }

  /**
   * Resolve the user's dedicated "Ironclaw Habits" calendar id, creating the
   * calendar (or adopting an existing same-named one) on first use and caching
   * the id. This is where the user adds recurring events that become habits.
   */
  async ensureHabitCalendar(userId: string): Promise<string> {
    const existing = await this.tokens.get(userId);
    if (existing?.habit_calendar_id) return existing.habit_calendar_id;

    const token = await this.getAccessToken(userId);
    const found = await findCalendarBySummary(token, HABIT_CALENDAR_NAME);
    const calendarId = found?.id ?? (await createCalendar(token, HABIT_CALENDAR_NAME)).id;
    await this.tokens.setHabitCalendarId(userId, calendarId);
    return calendarId;
  }

  /** The recurring-event masters on the user's habit calendar. */
  async listHabitMasters(userId: string): Promise<CalendarEvent[]> {
    const calendarId = await this.ensureHabitCalendar(userId);
    const token = await this.getAccessToken(userId);
    return listRecurringMasters(token, calendarId);
  }
}
