import { HabitRepository } from '../repositories/HabitRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { GoalService, ProgressResult } from './GoalService';
import {
  HabitLog,
  HabitCategory,
  HabitSchedule,
  HabitScheduleWithNames,
  Goal,
  Milestone,
} from '../types';
import { parseDurationToMinutes } from '../utils/duration';

export interface HabitLogResult {
  habitLog: HabitLog;
  /** Progress on the category-level (aggregate) goal, if one is active. */
  goalProgress: ProgressResult | null;
  /** Progress on the goal tied to this specific habit type, if one is active. */
  habitGoalProgress: ProgressResult | null;
}

export class HabitService {
  constructor(
    private habitRepo: HabitRepository,
    private goalRepo: GoalRepository,
    private goalService: GoalService
  ) {}

  async addCategory(userId: string, name: string, description?: string): Promise<HabitCategory> {
    const existing = await this.habitRepo.getCategoryByName(userId, name);
    if (existing) throw new Error(`Category "${name}" already exists.`);
    return this.habitRepo.createCategory(userId, name, description);
  }

  async listCategories(userId: string): Promise<HabitCategory[]> {
    return this.habitRepo.getAllCategories(userId);
  }

  async logRetroactive(
    userId: string,
    categoryName: string,
    habitTypeName: string,
    durationStr: string,
    note?: string
  ): Promise<HabitLogResult> {
    const category = await this.habitRepo.getCategoryByName(userId, categoryName);
    if (!category) throw new Error(`Category "${categoryName}" not found.`);

    const habitType = await this.habitRepo.upsertHabitType(category.id, habitTypeName);
    const durationMinutes = parseDurationToMinutes(durationStr);
    const habitLog = await this.habitRepo.createLog(userId, habitType.id, durationMinutes, note);

    // Advance the goal tied to this specific habit type (e.g. a "running" goal)...
    let habitGoalProgress: ProgressResult | null = null;
    const habitGoal = await this.goalRepo.getActiveByHabitType(habitType.id);
    if (habitGoal) {
      habitGoalProgress = await this.goalService.logProgress(
        habitGoal.id,
        durationMinutes,
        'minutes',
        null,
        habitLog.id
      );
    }

    // ...and the broader category-level goal, if one is active.
    let goalProgress: ProgressResult | null = null;
    const goal = await this.goalRepo.getActiveByCategory(category.id);
    if (goal) {
      goalProgress = await this.goalService.logProgress(
        goal.id,
        durationMinutes,
        'minutes',
        null,
        habitLog.id
      );
    }

    return { habitLog, goalProgress, habitGoalProgress };
  }

  async getWeeklySummary(userId: string): Promise<{ name: string; total_minutes: number }[]> {
    return this.habitRepo.getWeeklySummary(userId);
  }

  /**
   * Schedule a habit at an expected time on given weekdays, e.g.
   * running at 06:00 on Mon/Wed/Fri. Creates the habit type if it does not exist.
   */
  async addSchedule(
    userId: string,
    categoryName: string,
    habitTypeName: string,
    expectedAt: string,
    daysOfWeek: number[],
    graceMinutes?: number
  ): Promise<HabitSchedule> {
    const category = await this.habitRepo.getCategoryByName(userId, categoryName);
    if (!category) throw new Error(`Category "${categoryName}" not found.`);
    const habitType = await this.habitRepo.upsertHabitType(category.id, habitTypeName);
    return this.habitRepo.createSchedule(userId, habitType.id, expectedAt, daysOfWeek, graceMinutes);
  }

  async listSchedules(userId: string): Promise<HabitScheduleWithNames[]> {
    return this.habitRepo.getActiveSchedules(userId);
  }

  /** Create a goal for a specific habit, with `targetStr` parsed as a duration (e.g. "50h"). */
  async setHabitGoal(
    userId: string,
    categoryName: string,
    habitTypeName: string,
    targetStr: string,
    deadline: Date | null = null
  ): Promise<{ goal: Goal; milestone: Milestone }> {
    const targetMinutes = parseDurationToMinutes(targetStr);
    return this.goalService.createHabitGoal(
      userId,
      categoryName,
      habitTypeName,
      targetMinutes,
      deadline
    );
  }
}
