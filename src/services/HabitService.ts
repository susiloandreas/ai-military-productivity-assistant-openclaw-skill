import { HabitRepository } from '../repositories/HabitRepository';
import { MissionRepository } from '../repositories/MissionRepository';
import { GoalService } from './GoalService';
import {
  HabitCategory,
  HabitSchedule,
  HabitScheduleWithNames,
  Goal,
  Milestone,
} from '../types';
import { parseDurationToMinutes } from '../utils/duration';

export class HabitService {
  constructor(
    private habitRepo: HabitRepository,
    private missionRepo: MissionRepository,
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

  async getWeeklySummary(userId: string): Promise<{ name: string; total_minutes: number }[]> {
    return this.missionRepo.getWeeklyCategorySummary(userId);
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
