import { StreakRepository } from '../repositories/StreakRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { HabitScheduleWithNames, StreakSnapshot } from '../types';
import {
  StreakSchedule,
  advanceStreak,
  computeOverallAfterGap,
  computeStreakAfterGap,
  consecutiveMisses,
} from './streakMath';
import { ToneContext } from './toneGate';

/**
 * Owns the streak ("chain") lifecycle: advance it when a habit/mission is
 * completed, and read a break-applied snapshot for surfacing. The arithmetic
 * lives in streakMath (pure); this layer wires it to the repositories.
 */
export class StreakService {
  constructor(
    private streakRepo: StreakRepository,
    private habitRepo: HabitRepository
  ) {}

  /** The active schedule for a habit type, in the minimal shape streakMath needs. */
  private toStreakSchedule(schedule: HabitScheduleWithNames | undefined): StreakSchedule | null {
    if (!schedule) return null;
    return {
      days_of_week: schedule.days_of_week,
      expected_at: schedule.expected_at,
      grace_minutes: schedule.grace_minutes,
    };
  }

  /**
   * Record a completion at `now`, advancing both the habit-type streak (when the
   * mission is habit-linked) and the overall streak. Idempotent within a local
   * day — a second completion the same day does not inflate either streak.
   */
  async recordCompletion(userId: string, habitTypeId: string | null, now: Date = new Date()): Promise<void> {
    if (habitTypeId) {
      const [row, schedules] = await Promise.all([
        this.streakRepo.getHabit(userId, habitTypeId),
        this.habitRepo.getActiveSchedules(userId),
      ]);
      const schedule = this.toStreakSchedule(schedules.find(s => s.habit_type_id === habitTypeId));
      // Ignore today's window when advancing — logging now keeps the chain alive.
      const alive = computeStreakAfterGap(row, schedule, now, false);
      const next = advanceStreak(row, alive, now);
      await this.streakRepo.upsert(userId, habitTypeId, next.current, next.longest, next.lastLoggedDay);
    }

    const overallRow = await this.streakRepo.getOverall(userId);
    const aliveOverall = computeOverallAfterGap(overallRow, now);
    const nextOverall = advanceStreak(overallRow, aliveOverall, now);
    await this.streakRepo.upsert(userId, null, nextOverall.current, nextOverall.longest, nextOverall.lastLoggedDay);
  }

  /** Per-habit + overall streaks with pending breaks applied (for surfacing). */
  async getSnapshot(userId: string, now: Date = new Date()): Promise<StreakSnapshot> {
    const [rows, schedules] = await Promise.all([
      this.streakRepo.getAll(userId),
      this.habitRepo.getActiveSchedules(userId),
    ]);

    const overallRow = rows.find(r => r.habit_type_id === null) ?? null;
    const overallCurrent = computeOverallAfterGap(overallRow, now);

    const habits = rows
      .filter(r => r.habit_type_id !== null)
      .map(r => {
        const schedule = this.toStreakSchedule(schedules.find(s => s.habit_type_id === r.habit_type_id));
        return {
          habit_type_id: r.habit_type_id as string,
          current: computeStreakAfterGap(r, schedule, now, true),
          longest: r.longest_count,
        };
      })
      .filter(h => h.current > 0 || h.longest > 0);

    return {
      overall: { current: overallCurrent, longest: overallRow?.longest_count ?? 0 },
      habits,
    };
  }

  /**
   * Streak-derived signals for the tone gate: the largest consecutive-miss run
   * across habits, and whether an active streak will break today unless logged.
   * `loggedToday` is the set of habit-type ids already completed today.
   */
  async toneSignals(
    userId: string,
    loggedToday: Set<string>,
    now: Date = new Date()
  ): Promise<Pick<ToneContext, 'maxConsecutiveMisses' | 'streakAtRiskToday'>> {
    const [rows, schedules] = await Promise.all([
      this.streakRepo.getAll(userId),
      this.habitRepo.getActiveSchedules(userId),
    ]);
    const rowByType = new Map(rows.filter(r => r.habit_type_id).map(r => [r.habit_type_id!, r]));
    const weekday = now.getDay();

    let maxConsecutiveMisses = 0;
    let streakAtRiskToday = false;
    for (const s of schedules) {
      const row = rowByType.get(s.habit_type_id) ?? null;
      const sched = this.toStreakSchedule(s)!;
      maxConsecutiveMisses = Math.max(maxConsecutiveMisses, consecutiveMisses(row, sched, now));
      const current = computeStreakAfterGap(row, sched, now, false);
      if (current > 0 && s.days_of_week.includes(weekday) && !loggedToday.has(s.habit_type_id)) {
        streakAtRiskToday = true;
      }
    }
    return { maxConsecutiveMisses, streakAtRiskToday };
  }

  /** Current streak for one habit type (break-applied), 0 if none. */
  async getHabitCurrent(userId: string, habitTypeId: string, now: Date = new Date()): Promise<number> {
    const [row, schedules] = await Promise.all([
      this.streakRepo.getHabit(userId, habitTypeId),
      this.habitRepo.getActiveSchedules(userId),
    ]);
    const schedule = this.toStreakSchedule(schedules.find(s => s.habit_type_id === habitTypeId));
    return computeStreakAfterGap(row, schedule, now, true);
  }
}
