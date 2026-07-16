import { buildMissionCalendarEvent } from '../missionCalendar';
import { CalendarEventRecord } from '../../types';

const TZ = 'Asia/Jakarta';
const startedAt = new Date('2026-07-16T12:37:00+07:00');

function evt(over: Partial<CalendarEventRecord>): CalendarEventRecord {
  return {
    id: 'x', user_id: 'u', calendar_id: 'primary', event_id: 'e',
    title: 'Lunch', category: null, location: null,
    starts_at: new Date('2026-07-16T12:00:00+07:00'),
    ends_at: new Date('2026-07-16T13:00:00+07:00'),
    all_day: false, html_link: null, updated_at: startedAt,
    ...over,
  };
}

describe('buildMissionCalendarEvent', () => {
  it('builds an event spanning the mission ETA', () => {
    const ev = buildMissionCalendarEvent(
      { title: 'coba', started_at: startedAt, eta_minutes: 10 },
      null,
      [],
      TZ
    );
    expect(ev).not.toBeNull();
    expect(ev!.summary).toBe('coba');
    expect(ev!.start.dateTime).toBe(startedAt.toISOString());
    expect(ev!.end.dateTime).toBe(new Date(startedAt.getTime() + 10 * 60000).toISOString());
    expect(ev!.start.timeZone).toBe(TZ);
  });

  it('uses the default block length when the mission has no ETA', () => {
    const ev = buildMissionCalendarEvent(
      { title: 'coba', started_at: startedAt, eta_minutes: null },
      null,
      [],
      TZ
    );
    expect(ev!.end.dateTime).toBe(new Date(startedAt.getTime() + 30 * 60000).toISOString());
  });

  it('appends the category as a #hashtag so it round-trips through sync', () => {
    const ev = buildMissionCalendarEvent(
      { title: 'deep work', started_at: startedAt, eta_minutes: 60 },
      'Work',
      [],
      TZ
    );
    expect(ev!.summary).toBe('deep work #Work');
  });

  it('sanitizes a category with spaces into a single tag token', () => {
    const ev = buildMissionCalendarEvent(
      { title: 'x', started_at: startedAt, eta_minutes: 5 },
      'Deep Focus',
      [],
      TZ
    );
    expect(ev!.summary).toBe('x #DeepFocus');
  });

  it('returns null when a same-title event already overlaps the start', () => {
    const existing = [evt({ title: 'Lunch' })]; // 12:00–13:00 covers 12:37
    const ev = buildMissionCalendarEvent(
      { title: 'lunch', started_at: startedAt, eta_minutes: 20 }, // case-insensitive
      null,
      existing,
      TZ
    );
    expect(ev).toBeNull();
  });

  it('still creates when an overlapping event has a different title', () => {
    const existing = [evt({ title: 'Lunch' })];
    const ev = buildMissionCalendarEvent(
      { title: 'coba', started_at: startedAt, eta_minutes: 20 },
      null,
      existing,
      TZ
    );
    expect(ev).not.toBeNull();
    expect(ev!.summary).toBe('coba');
  });

  it('creates when the same-title event does not overlap the start', () => {
    const existing = [evt({
      title: 'coba',
      starts_at: new Date('2026-07-16T09:00:00+07:00'),
      ends_at: new Date('2026-07-16T09:30:00+07:00'),
    })];
    const ev = buildMissionCalendarEvent(
      { title: 'coba', started_at: startedAt, eta_minutes: 10 },
      null,
      existing,
      TZ
    );
    expect(ev).not.toBeNull();
  });
});
