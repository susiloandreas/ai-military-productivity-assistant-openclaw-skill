import { Streak } from '../types';

/**
 * Pure streak arithmetic — no DB, no network — so the "don't break the chain"
 * rules are fully unit-testable. The StreakService wires these to the repos.
 *
 * Two streak kinds:
 *  - per-habit: alive while no SCHEDULED day has passed unlogged since the last
 *    log (evaluated against the habit's schedule + grace window);
 *  - overall: alive while no full calendar day has passed with no completion.
 *
 * All dates are interpreted in the process's local timezone (set TZ), matching
 * how the rest of the app reads habit windows.
 */

/** Minimal schedule shape needed to decide whether a day was a missed window. */
export interface StreakSchedule {
  days_of_week: number[]; // 0=Sun..6=Sat
  expected_at: string; // 'HH:MM[:SS]'
  grace_minutes: number;
}

/** Local calendar day as 'YYYY-MM-DD'. */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight Date for a 'YYYY-MM-DD' string. */
function dayStart(dayStr: string): Date {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** End of a habit's grace window on a given local calendar day. */
function graceEnd(dayDate: Date, expectedAt: string, graceMinutes: number): Date {
  const [hh, mm] = expectedAt.split(':').map(Number);
  const end = new Date(dayDate);
  end.setHours(hh, mm + graceMinutes, 0, 0);
  return end;
}

/**
 * The per-habit current streak after applying any pending break. Returns 0 if a
 * scheduled day passed unlogged since `last_logged_day`, otherwise the stored
 * current count. With `includeToday: false`, today's window is ignored (used
 * when recording a completion that is happening right now); with `true` (the
 * default, used on read) a closed-and-unlogged window today also breaks it.
 *
 * When `schedule` is null (an ad-hoc habit with no schedule) the streak is
 * treated like the overall streak: it breaks once a full calendar day has gone by.
 */
export function computeStreakAfterGap(
  row: Streak | null,
  schedule: StreakSchedule | null,
  now: Date,
  includeToday = true
): number {
  if (!row || row.current_count <= 0 || !row.last_logged_day) return 0;
  if (!schedule) return calendarAlive(row, now) ? row.current_count : 0;

  const todayStr = localDay(now);
  let cursor = addDays(dayStart(row.last_logged_day), 1);
  for (let guard = 0; guard < 400 && localDay(cursor) <= todayStr; guard++) {
    const isToday = localDay(cursor) === todayStr;
    if (isToday && !includeToday) break;
    if (schedule.days_of_week.includes(cursor.getDay())) {
      const end = graceEnd(cursor, schedule.expected_at, schedule.grace_minutes);
      if (end.getTime() < now.getTime()) return 0; // a scheduled window closed unlogged
    }
    cursor = addDays(cursor, 1);
  }
  return row.current_count;
}

/** Calendar-consecutive aliveness: alive iff the last log was today or yesterday. */
function calendarAlive(row: Streak, now: Date): boolean {
  if (!row.last_logged_day) return false;
  const todayStr = localDay(now);
  const yesterdayStr = localDay(addDays(dayStart(todayStr), -1));
  return row.last_logged_day === todayStr || row.last_logged_day === yesterdayStr;
}

/** The overall current streak after applying any pending break. */
export function computeOverallAfterGap(row: Streak | null, now: Date): number {
  if (!row || row.current_count <= 0 || !row.last_logged_day) return 0;
  return calendarAlive(row, now) ? row.current_count : 0;
}

export interface StreakUpdate {
  current: number;
  longest: number;
  lastLoggedDay: string;
}

/**
 * Next streak state after a completion today. `aliveCurrent` is the current
 * count with past breaks already applied. Logging twice in one day (last log was
 * already today) does not increment.
 */
export function advanceStreak(row: Streak | null, aliveCurrent: number, now: Date): StreakUpdate {
  const todayStr = localDay(now);
  const alreadyToday = row?.last_logged_day === todayStr;
  const current = alreadyToday ? Math.max(aliveCurrent, 1) : aliveCurrent + 1;
  const longest = Math.max(row?.longest_count ?? 0, current);
  return { current, longest, lastLoggedDay: todayStr };
}

/**
 * Consecutive missed SCHEDULED days for a habit, counting back from `now`. 0 when
 * the habit is currently logged/within window; 1 after one closed-unlogged
 * window; 2+ once a second consecutive scheduled window has closed unlogged.
 * Drives the miss-recovery "never miss twice" escalation.
 */
export function consecutiveMisses(
  row: Streak | null,
  schedule: StreakSchedule,
  now: Date
): number {
  const todayStr = localDay(now);
  let misses = 0;
  let cursor = dayStart(todayStr);
  for (let guard = 0; guard < 400; guard++) {
    const dayStr = localDay(cursor);
    // Stop once we reach the day it was last logged — the chain is intact from there.
    if (row?.last_logged_day && dayStr <= row.last_logged_day) break;
    if (schedule.days_of_week.includes(cursor.getDay())) {
      const end = graceEnd(cursor, schedule.expected_at, schedule.grace_minutes);
      if (end.getTime() < now.getTime()) {
        misses++;
      } else if (dayStr !== todayStr) {
        // a past scheduled day whose window somehow hasn't closed — stop
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }
  return misses;
}
