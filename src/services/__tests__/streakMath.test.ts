import {
  StreakSchedule,
  advanceStreak,
  computeOverallAfterGap,
  computeStreakAfterGap,
  consecutiveMisses,
  localDay,
} from '../streakMath';
import { Streak } from '../../types';

// Daily 06:00 habit with a 60-min grace window (closes 07:00), every weekday.
const daily: StreakSchedule = {
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  expected_at: '06:00:00',
  grace_minutes: 60,
};

// Mon/Wed/Fri 06:00 habit.
const mwf: StreakSchedule = { days_of_week: [1, 3, 5], expected_at: '06:00:00', grace_minutes: 60 };

function streak(overrides: Partial<Streak> = {}): Streak {
  return {
    user_id: 'u1',
    habit_type_id: 't1',
    current_count: 3,
    longest_count: 5,
    last_logged_day: '2026-06-08', // Monday
    ...overrides,
  };
}

// 2026-06-08 is a Monday.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);

describe('streakMath — per-habit break', () => {
  it('keeps the streak alive when logged today (no gap)', () => {
    const now = at(2026, 6, 8, 9); // same day as last_logged_day, after window
    expect(computeStreakAfterGap(streak(), daily, now)).toBe(3);
  });

  it('keeps the streak alive the next day before the grace window closes', () => {
    const now = at(2026, 6, 9, 6, 30); // Tue 06:30, window (→07:00) still open
    expect(computeStreakAfterGap(streak(), daily, now)).toBe(3);
  });

  it('breaks the streak once a scheduled window closes unlogged', () => {
    const now = at(2026, 6, 9, 7, 1); // Tue 07:01, window closed, not logged
    expect(computeStreakAfterGap(streak(), daily, now)).toBe(0);
  });

  it('does not break on a non-scheduled day', () => {
    // MWF habit last logged Fri; Sat/Sun are not scheduled, so Sun is still alive.
    const friday = streak({ last_logged_day: '2026-06-12' }); // 2026-06-12 is a Friday
    const sunday = at(2026, 6, 14, 20); // Sunday evening — no MWF window missed
    expect(computeStreakAfterGap(friday, mwf, sunday)).toBe(3);
  });

  it('ignores today when includeToday is false (recording a completion now)', () => {
    const now = at(2026, 6, 9, 8); // Tue, today's window already closed
    // includeToday=false → today is not counted as a miss, so streak survives
    expect(computeStreakAfterGap(streak(), daily, now, false)).toBe(3);
    // includeToday=true → today's closed window breaks it
    expect(computeStreakAfterGap(streak(), daily, now, true)).toBe(0);
  });

  it('returns 0 for an empty or zeroed row', () => {
    expect(computeStreakAfterGap(null, daily, at(2026, 6, 9, 8))).toBe(0);
    expect(computeStreakAfterGap(streak({ current_count: 0 }), daily, at(2026, 6, 9, 8))).toBe(0);
  });
});

describe('streakMath — overall break', () => {
  it('alive when last completion was today or yesterday', () => {
    const row = streak({ habit_type_id: null, last_logged_day: '2026-06-08' });
    expect(computeOverallAfterGap(row, at(2026, 6, 8, 23))).toBe(3); // today
    expect(computeOverallAfterGap(row, at(2026, 6, 9, 10))).toBe(3); // yesterday
  });

  it('broken once a full calendar day passes with no completion', () => {
    const row = streak({ habit_type_id: null, last_logged_day: '2026-06-08' });
    expect(computeOverallAfterGap(row, at(2026, 6, 10, 0, 1))).toBe(0);
  });
});

describe('streakMath — advanceStreak', () => {
  it('increments once for a new day and preserves longest', () => {
    const row = streak({ current_count: 3, longest_count: 5, last_logged_day: '2026-06-08' });
    const next = advanceStreak(row, 3, at(2026, 6, 9, 6, 30));
    expect(next.current).toBe(4);
    expect(next.longest).toBe(5);
    expect(next.lastLoggedDay).toBe('2026-06-09');
  });

  it('does not double-count a second log the same day', () => {
    const row = streak({ current_count: 4, last_logged_day: '2026-06-09' });
    const next = advanceStreak(row, 4, at(2026, 6, 9, 20));
    expect(next.current).toBe(4);
  });

  it('starts at 1 from a broken streak and bumps longest when surpassed', () => {
    const row = streak({ current_count: 0, longest_count: 2, last_logged_day: '2026-06-01' });
    const next = advanceStreak(row, 0, at(2026, 6, 9, 6, 30));
    expect(next.current).toBe(1);
    expect(next.longest).toBe(2);
  });
});

describe('streakMath — consecutiveMisses (never miss twice)', () => {
  it('is 0 when the habit is still logged/within window', () => {
    const row = streak({ last_logged_day: '2026-06-08' });
    expect(consecutiveMisses(row, daily, at(2026, 6, 8, 23))).toBe(0);
  });

  it('is 1 after a single closed-unlogged window', () => {
    const row = streak({ last_logged_day: '2026-06-08' });
    expect(consecutiveMisses(row, daily, at(2026, 6, 9, 8))).toBe(1); // Tue missed
  });

  it('is 2 after two consecutive missed scheduled days', () => {
    const row = streak({ last_logged_day: '2026-06-08' });
    expect(consecutiveMisses(row, daily, at(2026, 6, 10, 8))).toBe(2); // Tue + Wed missed
  });

  it('counts only scheduled days for a MWF habit', () => {
    const row = streak({ last_logged_day: '2026-06-08' }); // Mon logged
    // By Friday morning after window: Wed + Fri missed (Tue/Thu not scheduled) = 2
    expect(consecutiveMisses(row, mwf, at(2026, 6, 12, 8))).toBe(2);
  });
});

describe('streakMath — localDay', () => {
  it('formats a local calendar day', () => {
    expect(localDay(at(2026, 6, 8, 9))).toBe('2026-06-08');
  });
});
