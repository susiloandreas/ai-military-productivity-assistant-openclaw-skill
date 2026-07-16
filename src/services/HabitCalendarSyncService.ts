import { HabitRepository } from '../repositories/HabitRepository';
import { GoogleCalendarService } from './GoogleCalendarService';
import { eventToSchedule } from '../utils/habitCalendarMap';

/** Category that calendar-sourced habit types are filed under when new. */
export const CALENDAR_HABIT_CATEGORY = 'Habits';

export interface HabitSyncResult {
  /** Habits created or updated from calendar events. */
  synced: { name: string; expectedAt: string; days: number[] }[];
  /** Events that could not become a habit (all-day, one-off, no title). */
  skipped: { summary: string; reason: string }[];
  /** Calendar-sourced schedules deactivated because their event was deleted. */
  deactivated: number;
}

/**
 * Pulls recurring events from the user's dedicated "Ironclaw Habits" calendar
 * and reconciles them into habit_schedules. Google Calendar owns the *schedule*
 * (when a habit is expected); the DB keeps owning streaks/completion/scoring.
 * The sync is idempotent and only touches calendar-sourced schedule rows.
 */
export class HabitCalendarSyncService {
  constructor(
    private readonly habitRepo: HabitRepository,
    private readonly calendar: GoogleCalendarService
  ) {}

  /** Find-or-create the default category for calendar-sourced habits. */
  private async defaultCategoryId(userId: string): Promise<string> {
    const existing = await this.habitRepo.getCategoryByName(userId, CALENDAR_HABIT_CATEGORY);
    if (existing) return existing.id;
    const created = await this.habitRepo.createCategory(
      userId,
      CALENDAR_HABIT_CATEGORY,
      'Habits synced from Google Calendar'
    );
    return created.id;
  }

  /**
   * Resolve the habit_type id for a habit name: reuse an existing type of that
   * name (any category, preserving its unit) or create one under the default
   * "Habits" category.
   */
  private async resolveHabitTypeId(userId: string, name: string): Promise<string> {
    const existing = await this.habitRepo.findHabitTypeByName(userId, name);
    if (existing) return existing.id;
    const categoryId = await this.defaultCategoryId(userId);
    const created = await this.habitRepo.upsertHabitType(categoryId, name);
    return created.id;
  }

  /** Run a full sync for the user. Idempotent — safe to call repeatedly. */
  async sync(userId: string): Promise<HabitSyncResult> {
    const events = await this.calendar.listHabitMasters(userId);
    const result: HabitSyncResult = { synced: [], skipped: [], deactivated: 0 };
    const keepEventIds: string[] = [];

    for (const ev of events) {
      const mapped = eventToSchedule(ev);
      if (!mapped) {
        result.skipped.push({
          summary: ev.summary ?? '(untitled)',
          reason: !ev.summary?.trim()
            ? 'no title'
            : !ev.start?.dateTime
              ? 'all-day event (no time)'
              : 'not a daily/weekly recurring event',
        });
        continue;
      }

      const habitTypeId = await this.resolveHabitTypeId(userId, mapped.name);
      await this.habitRepo.upsertScheduleFromCalendar(
        userId,
        habitTypeId,
        ev.id,
        mapped.expectedAt,
        mapped.daysOfWeek
      );
      keepEventIds.push(ev.id);
      result.synced.push({ name: mapped.name, expectedAt: mapped.expectedAt, days: mapped.daysOfWeek });
    }

    result.deactivated = await this.habitRepo.deactivateCalendarSchedulesNotIn(userId, keepEventIds);
    return result;
  }
}
