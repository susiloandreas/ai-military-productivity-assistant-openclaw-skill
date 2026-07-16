import {
  eventToSchedule,
  recurrenceDays,
  wallClockTime,
  HabitEventShape,
} from '../habitCalendarMap';

describe('wallClockTime', () => {
  it('extracts HH:MM:SS from an RFC3339 dateTime with offset', () => {
    expect(wallClockTime({ dateTime: '2026-07-16T06:00:00+07:00' })).toBe('06:00:00');
  });
  it('handles a Z (UTC) suffix', () => {
    expect(wallClockTime({ dateTime: '2026-07-16T21:30:00Z' })).toBe('21:30:00');
  });
  it('defaults seconds to 00 when absent', () => {
    expect(wallClockTime({ dateTime: '2026-07-16T06:00+07:00' })).toBe('06:00:00');
  });
  it('returns null for an all-day event (date only)', () => {
    expect(wallClockTime({ date: '2026-07-16' })).toBeNull();
  });
});

describe('recurrenceDays', () => {
  const start = { dateTime: '2026-07-16T06:00:00+07:00' }; // 2026-07-16 is a Thursday

  it('maps WEEKLY BYDAY to sorted day numbers', () => {
    expect(recurrenceDays(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], start)).toEqual([1, 3, 5]);
  });
  it('treats DAILY as every day', () => {
    expect(recurrenceDays(['RRULE:FREQ=DAILY'], start)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('falls back to the start weekday for WEEKLY without BYDAY', () => {
    expect(recurrenceDays(['RRULE:FREQ=WEEKLY'], start)).toEqual([4]); // Thursday
  });
  it('strips ordinal prefixes in BYDAY (e.g. 2MO)', () => {
    expect(recurrenceDays(['RRULE:FREQ=WEEKLY;BYDAY=2MO,-1FR'], start)).toEqual([1, 5]);
  });
  it('ignores non-RRULE lines like EXDATE', () => {
    expect(
      recurrenceDays(['EXDATE;TZID=Asia/Jakarta:20260717T060000', 'RRULE:FREQ=WEEKLY;BYDAY=SU'], start)
    ).toEqual([0]);
  });
  it('returns null for unsupported cadences (MONTHLY)', () => {
    expect(recurrenceDays(['RRULE:FREQ=MONTHLY;BYDAY=1MO'], start)).toBeNull();
  });
  it('returns null when there is no recurrence', () => {
    expect(recurrenceDays(undefined, start)).toBeNull();
  });
});

describe('eventToSchedule', () => {
  it('maps a well-formed recurring event', () => {
    const ev: HabitEventShape = {
      summary: 'Running',
      start: { dateTime: '2026-07-16T06:00:00+07:00' },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'],
    };
    expect(eventToSchedule(ev)).toEqual({
      name: 'Running',
      expectedAt: '06:00:00',
      daysOfWeek: [1, 3, 5],
    });
  });

  it('trims the summary', () => {
    const ev: HabitEventShape = {
      summary: '  Read 30 min  ',
      start: { dateTime: '2026-07-16T21:00:00+07:00' },
      recurrence: ['RRULE:FREQ=DAILY'],
    };
    expect(eventToSchedule(ev)?.name).toBe('Read 30 min');
  });

  it('returns null for a one-off (non-recurring) event', () => {
    expect(
      eventToSchedule({ summary: 'Dentist', start: { dateTime: '2026-07-16T14:00:00+07:00' } })
    ).toBeNull();
  });

  it('returns null for an all-day recurring event', () => {
    expect(
      eventToSchedule({ summary: 'Fast', start: { date: '2026-07-16' }, recurrence: ['RRULE:FREQ=DAILY'] })
    ).toBeNull();
  });

  it('returns null for an untitled event', () => {
    expect(
      eventToSchedule({ start: { dateTime: '2026-07-16T06:00:00+07:00' }, recurrence: ['RRULE:FREQ=DAILY'] })
    ).toBeNull();
  });
});
