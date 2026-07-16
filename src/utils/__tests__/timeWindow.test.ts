import { zonedTodayWindow, tzOffsetMinutes } from '../timeWindow';

describe('tzOffsetMinutes', () => {
  it('is +420 for Asia/Jakarta (UTC+7, no DST)', () => {
    expect(tzOffsetMinutes(new Date('2026-07-16T05:00:00Z'), 'Asia/Jakarta')).toBe(420);
  });
  it('is 0 for UTC', () => {
    expect(tzOffsetMinutes(new Date('2026-07-16T05:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('zonedTodayWindow', () => {
  it('spans the Jakarta calendar day for a midday instant', () => {
    // 2026-07-16 12:00 in Jakarta (05:00 UTC)
    const w = zonedTodayWindow(new Date('2026-07-16T05:00:00Z'), 'Asia/Jakarta');
    expect(w.from).toBe('2026-07-15T17:00:00.000Z'); // Jakarta 2026-07-16 00:00
    expect(w.to).toBe('2026-07-16T16:59:59.999Z'); // Jakarta 2026-07-16 23:59:59.999
  });

  it('uses the local (not UTC) date near the day boundary', () => {
    // 2026-07-16 23:30 UTC is already 2026-07-17 06:30 in Jakarta
    const w = zonedTodayWindow(new Date('2026-07-16T23:30:00Z'), 'Asia/Jakarta');
    expect(w.from).toBe('2026-07-16T17:00:00.000Z'); // Jakarta 2026-07-17 00:00
    expect(w.to).toBe('2026-07-17T16:59:59.999Z');
  });
});
