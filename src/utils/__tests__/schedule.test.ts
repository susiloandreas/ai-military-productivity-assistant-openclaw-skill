import { parseTimeOfDay, parseDaysOfWeek, formatDaysOfWeek } from '../schedule';

describe('parseTimeOfDay', () => {
  it('normalizes H:MM to HH:MM', () => {
    expect(parseTimeOfDay('6:00')).toBe('06:00');
  });

  it('accepts HH:MM', () => {
    expect(parseTimeOfDay('21:30')).toBe('21:30');
  });

  it('throws on out-of-range hours', () => {
    expect(() => parseTimeOfDay('24:00')).toThrow('Invalid time');
  });

  it('throws on out-of-range minutes', () => {
    expect(() => parseTimeOfDay('06:60')).toThrow('Invalid time');
  });

  it('throws on garbage', () => {
    expect(() => parseTimeOfDay('morning')).toThrow('Invalid time');
  });
});

describe('parseDaysOfWeek', () => {
  it('expands "daily" to all 7 days', () => {
    expect(parseDaysOfWeek('daily')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('expands "weekdays" to Mon–Fri', () => {
    expect(parseDaysOfWeek('weekdays')).toEqual([1, 2, 3, 4, 5]);
  });

  it('expands "weekends" to Sun + Sat', () => {
    expect(parseDaysOfWeek('weekends')).toEqual([0, 6]);
  });

  it('parses a comma list, sorted and de-duplicated', () => {
    expect(parseDaysOfWeek('fri,mon,mon,wed')).toEqual([1, 3, 5]);
  });

  it('parses Indonesian day names', () => {
    expect(parseDaysOfWeek('sen, rab, jum')).toEqual([1, 3, 5]);
  });

  it('throws on an unknown day', () => {
    expect(() => parseDaysOfWeek('mon,funday')).toThrow('Unknown day');
  });
});

describe('formatDaysOfWeek', () => {
  it('renders all 7 days as "Setiap hari"', () => {
    expect(formatDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBe('Setiap hari');
  });

  it('renders a subset as short labels', () => {
    expect(formatDaysOfWeek([1, 3, 5])).toBe('Sen, Rab, Jum');
  });
});
