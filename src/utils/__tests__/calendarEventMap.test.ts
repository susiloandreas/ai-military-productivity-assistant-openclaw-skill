import { parseCategoryTag, eventToRow } from '../calendarEventMap';
import { CalendarEvent } from '../googleCalendar';

describe('parseCategoryTag', () => {
  it('pulls the first hashtag as an upper-cased category', () => {
    expect(parseCategoryTag('Meeting a #WORK')).toEqual({ title: 'Meeting a', category: 'WORK' });
  });
  it('upper-cases a lower-case tag', () => {
    expect(parseCategoryTag('Gym session #fitness')).toEqual({ title: 'Gym session', category: 'FITNESS' });
  });
  it('takes the first of multiple tags but strips them all', () => {
    expect(parseCategoryTag('Standup #work #daily')).toEqual({ title: 'Standup', category: 'WORK' });
  });
  it('collapses whitespace left by a mid-title tag', () => {
    expect(parseCategoryTag('Call #WORK with client')).toEqual({ title: 'Call with client', category: 'WORK' });
  });
  it('returns null category when there is no tag', () => {
    expect(parseCategoryTag('Dentist appointment')).toEqual({ title: 'Dentist appointment', category: null });
  });
  it('keeps the original title if it is only a tag', () => {
    expect(parseCategoryTag('#WORK')).toEqual({ title: '#WORK', category: 'WORK' });
  });
});

describe('eventToRow', () => {
  const base: CalendarEvent = {
    id: 'evt_1',
    summary: 'Meeting a #WORK',
    start: { dateTime: '2026-07-16T09:00:00+07:00' },
    end: { dateTime: '2026-07-16T10:00:00+07:00' },
    htmlLink: 'https://cal/evt_1',
    location: 'Room 3',
  };

  it('maps a timed event with a category', () => {
    const row = eventToRow(base, 'primary');
    expect(row).toMatchObject({
      calendar_id: 'primary',
      event_id: 'evt_1',
      title: 'Meeting a',
      category: 'WORK',
      location: 'Room 3',
      all_day: false,
      html_link: 'https://cal/evt_1',
    });
    expect(row?.starts_at).toBe(new Date('2026-07-16T09:00:00+07:00').toISOString());
  });

  it('flags all-day events and uses UTC midnight', () => {
    const row = eventToRow(
      { id: 'e2', summary: 'Holiday #PERSONAL', start: { date: '2026-07-16' }, end: { date: '2026-07-17' } },
      'work'
    );
    expect(row?.all_day).toBe(true);
    expect(row?.starts_at).toBe('2026-07-16T00:00:00.000Z');
  });

  it('returns null when there is no start', () => {
    expect(eventToRow({ id: 'e3', summary: 'No start' } as CalendarEvent, 'primary')).toBeNull();
  });

  it('returns null when there is no title', () => {
    expect(eventToRow({ id: 'e4', start: { dateTime: '2026-07-16T09:00:00Z' } } as CalendarEvent, 'primary')).toBeNull();
  });
});
