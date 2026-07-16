import { findConflictingEvents } from '../calendarConflict';
import { CalendarEventRecord } from '../../types';

const now = new Date('2026-07-16T12:37:00+07:00');

function ev(over: Partial<CalendarEventRecord>): CalendarEventRecord {
  return {
    id: 'x',
    user_id: 'u',
    calendar_id: 'primary',
    event_id: 'e',
    title: 'Event',
    category: null,
    location: null,
    starts_at: new Date('2026-07-16T12:00:00+07:00'),
    ends_at: new Date('2026-07-16T13:00:00+07:00'),
    all_day: false,
    html_link: null,
    updated_at: now,
    ...over,
  };
}

describe('findConflictingEvents', () => {
  it('flags an event in progress right now as ongoing', () => {
    const r = findConflictingEvents([ev({})], now, 10);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('ongoing');
    expect(r[0].minutesUntilStart).toBe(0);
  });

  it('flags an event that starts within the ETA window as soon', () => {
    const soon = ev({
      starts_at: new Date('2026-07-16T12:45:00+07:00'),
      ends_at: new Date('2026-07-16T13:00:00+07:00'),
    });
    const r = findConflictingEvents([soon], now, 10); // window ends 12:47
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('soon');
    expect(r[0].minutesUntilStart).toBe(8);
  });

  it('ignores an event that starts after the ETA window', () => {
    const later = ev({
      starts_at: new Date('2026-07-16T14:00:00+07:00'),
      ends_at: new Date('2026-07-16T15:00:00+07:00'),
    });
    expect(findConflictingEvents([later], now, 10)).toEqual([]);
  });

  it('uses the 30-min default lookahead when the mission has no ETA', () => {
    const in20 = ev({
      starts_at: new Date('2026-07-16T12:57:00+07:00'),
      ends_at: new Date('2026-07-16T13:30:00+07:00'),
    });
    expect(findConflictingEvents([in20], now, null)).toHaveLength(1); // 20 < 30
    expect(findConflictingEvents([in20], now, 10)).toEqual([]); // 20 > 10
  });

  it('ignores all-day events', () => {
    const allDay = ev({ all_day: true, starts_at: new Date('2026-07-16T00:00:00Z') });
    expect(findConflictingEvents([allDay], now, 10)).toEqual([]);
  });

  it('ignores an event that already ended', () => {
    const past = ev({
      starts_at: new Date('2026-07-16T10:00:00+07:00'),
      ends_at: new Date('2026-07-16T11:00:00+07:00'),
    });
    expect(findConflictingEvents([past], now, 10)).toEqual([]);
  });

  it('sorts multiple conflicts earliest-first', () => {
    const ongoing = ev({ id: 'a', starts_at: new Date('2026-07-16T12:00:00+07:00') });
    const soon = ev({
      id: 'b',
      starts_at: new Date('2026-07-16T12:40:00+07:00'),
      ends_at: new Date('2026-07-16T13:00:00+07:00'),
    });
    const r = findConflictingEvents([soon, ongoing], now, 10);
    expect(r.map(c => c.event.id)).toEqual(['a', 'b']);
  });
});
