import { HabitScheduleWithNames, PlanBlock } from '../types';
import type { NewPlanBlock } from '../repositories/PlanRepository';

/**
 * Pure helpers for materializing the day plan from the habit-schedule template.
 * No DB or clock access — `now` is always passed in — so every rule here is
 * unit-testable in isolation (mirroring the streakMath / coachingContext split).
 */

/** The local calendar day as 'YYYY-MM-DD' (same local frame as now.getDay()). */
export function localDateStr(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Active schedules whose days_of_week include `weekday` (0=Sunday .. 6=Saturday). */
export function schedulesForWeekday(
  schedules: HabitScheduleWithNames[],
  weekday: number
): HabitScheduleWithNames[] {
  return schedules.filter(s => s.days_of_week.includes(weekday));
}

/** A materialized block input derived from one habit schedule. */
export function blockFromSchedule(s: HabitScheduleWithNames): NewPlanBlock {
  return {
    habitTypeId: s.habit_type_id,
    title: s.habit_type_name,
    startTime: s.expected_at,   // 'HH:MM:SS'
    durationMinutes: null,      // the template carries no activity length
    hardness: 'soft',
    sourceScheduleId: s.id,
  };
}

/**
 * Of the schedules due today, those that do not yet have a block — so a re-read
 * (or a schedule added mid-day) materializes only what is missing, never a
 * duplicate. A block is "already represented" when it points back at the schedule.
 */
export function missingScheduleBlocks(
  due: HabitScheduleWithNames[],
  existing: PlanBlock[]
): NewPlanBlock[] {
  const have = new Set(
    existing.map(b => b.source_schedule_id).filter((x): x is string => x !== null)
  );
  return due.filter(s => !have.has(s.id)).map(blockFromSchedule);
}
