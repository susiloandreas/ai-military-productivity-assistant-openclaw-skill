import { HabitRepository } from '../repositories/HabitRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { GoalService, ProgressResult } from './GoalService';
import { HabitLog, HabitCategory } from '../types';
import { parseDurationToMinutes } from '../utils/duration';

export interface HabitLogResult {
  habitLog: HabitLog;
  goalProgress: ProgressResult | null;
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

    return { habitLog, goalProgress };
  }

  async getWeeklySummary(userId: string): Promise<{ name: string; total_minutes: number }[]> {
    return this.habitRepo.getWeeklySummary(userId);
  }
}
