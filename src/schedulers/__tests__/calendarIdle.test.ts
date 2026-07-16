import { buildCalendarIdleMessage } from '../idleReminderMessages';
import { CalendarEventRecord } from '../../types';

const now = new Date('2026-07-16T12:37:00+07:00');

function ev(over: Partial<CalendarEventRecord>): CalendarEventRecord {
  return {
    id: 'x',
    user_id: 'u',
    calendar_id: 'primary',
    event_id: 'e',
    title: 'Lunch',
    category: 'BUFFER',
    location: null,
    starts_at: new Date('2026-07-16T12:00:00+07:00'),
    ends_at: new Date('2026-07-16T13:00:00+07:00'),
    all_day: false,
    html_link: null,
    updated_at: now,
    ...over,
  };
}

describe('buildCalendarIdleMessage', () => {
  it('confronts about an event in progress right now', () => {
    const msg = buildCalendarIdleMessage([ev({})], now);
    expect(msg).toContain('SEKARANG DI KALENDER');
    expect(msg).toContain('Lunch');
    expect(msg).toContain('(BUFFER)');
  });

  it('gives a heads-up for an event starting within the lookahead', () => {
    const soon = ev({
      title: 'Standup',
      starts_at: new Date('2026-07-16T13:00:00+07:00'), // 23 min away (< 30)
      ends_at: new Date('2026-07-16T13:15:00+07:00'),
    });
    const msg = buildCalendarIdleMessage([soon], now);
    expect(msg).toContain('SEBENTAR LAGI');
    expect(msg).toContain('Standup');
    expect(msg).toContain('23m lagi');
  });

  it('returns null when nothing is ongoing or starting soon', () => {
    const later = ev({
      starts_at: new Date('2026-07-16T15:00:00+07:00'),
      ends_at: new Date('2026-07-16T16:00:00+07:00'),
    });
    expect(buildCalendarIdleMessage([later], now)).toBeNull();
  });

  it('prefers an ongoing event over an upcoming one', () => {
    const ongoing = ev({ title: 'Deep Work', starts_at: new Date('2026-07-16T12:30:00+07:00') });
    const soon = ev({
      title: 'Standup',
      starts_at: new Date('2026-07-16T13:00:00+07:00'),
      ends_at: new Date('2026-07-16T13:15:00+07:00'),
    });
    expect(buildCalendarIdleMessage([soon, ongoing], now)).toContain('Deep Work');
  });

  it('ignores all-day events', () => {
    const allDay = ev({ all_day: true, starts_at: new Date('2026-07-16T00:00:00Z') });
    expect(buildCalendarIdleMessage([allDay], now)).toBeNull();
  });

  it('escapes HTML-significant characters in the title', () => {
    const msg = buildCalendarIdleMessage([ev({ title: 'A & B <team>' })], now);
    expect(msg).toContain('A &amp; B &lt;team&gt;');
  });
});
