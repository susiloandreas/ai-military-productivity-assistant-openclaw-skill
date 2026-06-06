import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService, ProgressResult } from './GoalService';
import { Mission } from '../types';
import { parseDurationToMinutes } from '../utils/duration';
import { Queue } from 'bullmq';
import { redisConnection } from '../db/connection';

export interface MissionCompleteResult {
  mission: Mission;
  goalProgress: ProgressResult | null;
}

export interface RetroactiveLogResult {
  mission: Mission;
  /** Progress on the goal tied to this specific habit type, if one is active. */
  habitGoalProgress: ProgressResult | null;
  /** Progress on the category-level (aggregate) goal, if one is active. */
  goalProgress: ProgressResult | null;
}

export class MissionService {
  private etaQueue: Queue;

  constructor(
    private missionRepo: MissionRepository,
    private goalRepo: GoalRepository,
    private habitRepo: HabitRepository,
    private goalService: GoalService
  ) {
    this.etaQueue = new Queue('eta-expiry', { connection: redisConnection });
  }

  async start(
    userId: string,
    title: string,
    etaStr: string | null,
    categoryName: string | null
  ): Promise<Mission> {
    const existing = await this.missionRepo.getActive(userId);
    if (existing) {
      throw new Error(
        `Active mission already running: "${existing.title}". Complete or abort it first.`
      );
    }

    let habitCategoryId: string | null = null;
    if (categoryName) {
      const category = await this.habitRepo.getCategoryByName(userId, categoryName);
      if (!category) {
        throw new Error(`Category "${categoryName}" not found. Create it first with /habit category add.`);
      }
      habitCategoryId = category.id;
    }

    const etaMinutes = etaStr ? parseDurationToMinutes(etaStr) : null;
    const mission = await this.missionRepo.create(userId, title, habitCategoryId, etaMinutes);

    if (etaMinutes) {
      await this.etaQueue.add(
        'expire',
        { missionId: mission.id },
        { delay: etaMinutes * 60 * 1000, jobId: `eta-${mission.id}` }
      );
    }

    return mission;
  }

  async complete(
    userId: string,
    actualDurationStr: string | null,
    notes: string | null
  ): Promise<MissionCompleteResult> {
    const mission = await this.missionRepo.getActive(userId);
    if (!mission) throw new Error('No active mission to complete.');

    const startedAt = mission.started_at ? new Date(mission.started_at) : new Date();
    const elapsedMinutes = Math.round((Date.now() - startedAt.getTime()) / 60000);
    const actualDuration = actualDurationStr
      ? parseDurationToMinutes(actualDurationStr)
      : elapsedMinutes;

    await this.etaQueue.remove(`eta-${mission.id}`).catch(() => null);

    const completed = await this.missionRepo.updateStatus(mission.id, 'completed', {
      actual_duration_minutes: actualDuration,
      notes: notes ?? undefined,
    });

    const { goalProgress } = await this.advanceGoals(mission, actualDuration);
    return { mission: completed, goalProgress };
  }

  /**
   * Record an activity that already happened (no live timer was running) as a
   * 'retroactive', already-completed mission, then advance any goals it feeds.
   */
  async logRetroactive(
    userId: string,
    categoryName: string,
    habitTypeName: string,
    durationStr: string,
    note: string | null
  ): Promise<RetroactiveLogResult> {
    const category = await this.habitRepo.getCategoryByName(userId, categoryName);
    if (!category) throw new Error(`Category "${categoryName}" not found.`);

    const habitType = await this.habitRepo.upsertHabitType(category.id, habitTypeName);
    const durationMinutes = parseDurationToMinutes(durationStr);
    const mission = await this.missionRepo.createRetroactive(
      userId,
      habitTypeName,
      category.id,
      habitType.id,
      durationMinutes,
      note
    );

    const { habitGoalProgress, goalProgress } = await this.advanceGoals(mission, durationMinutes);
    return { mission, habitGoalProgress, goalProgress };
  }

  /**
   * Advance the goal tied to this mission's habit type (e.g. a "running" goal) and
   * the broader category-level goal, if either is active.
   */
  private async advanceGoals(
    mission: Mission,
    durationMinutes: number
  ): Promise<{ habitGoalProgress: ProgressResult | null; goalProgress: ProgressResult | null }> {
    let habitGoalProgress: ProgressResult | null = null;
    if (mission.habit_type_id) {
      const habitGoal = await this.goalRepo.getActiveByHabitType(mission.habit_type_id);
      if (habitGoal) {
        habitGoalProgress = await this.goalService.logProgress(
          habitGoal.id,
          durationMinutes,
          'minutes',
          mission.id
        );
      }
    }

    let goalProgress: ProgressResult | null = null;
    if (mission.habit_category_id) {
      const goal = await this.goalRepo.getActiveByCategory(mission.habit_category_id);
      if (goal) {
        goalProgress = await this.goalService.logProgress(
          goal.id,
          durationMinutes,
          'minutes',
          mission.id
        );
      }
    }

    return { habitGoalProgress, goalProgress };
  }

  async abort(userId: string): Promise<Mission> {
    const mission = await this.missionRepo.getActive(userId);
    if (!mission) throw new Error('No active mission to abort.');
    await this.etaQueue.remove(`eta-${mission.id}`).catch(() => null);
    return this.missionRepo.updateStatus(mission.id, 'failed');
  }

  async extend(userId: string, additionalStr: string): Promise<Mission> {
    const mission = await this.missionRepo.getActive(userId);
    if (!mission) throw new Error('No active mission to extend.');
    const extra = parseDurationToMinutes(additionalStr);
    const updated = await this.missionRepo.extendEta(mission.id, extra);
    const startedAt = mission.started_at ? new Date(mission.started_at) : new Date();
    const newEta = (updated.eta_minutes ?? 0) * 60 * 1000;
    const remaining = startedAt.getTime() + newEta - Date.now();
    if (remaining > 0) {
      await this.etaQueue.remove(`eta-${mission.id}`).catch(() => null);
      await this.etaQueue.add(
        'expire',
        { missionId: mission.id },
        { delay: remaining, jobId: `eta-${mission.id}` }
      );
    }
    return updated;
  }

  async getActiveMission(userId: string): Promise<Mission | null> {
    return this.missionRepo.getActive(userId);
  }

  async getRecentCompleted(userId: string, days = 7): Promise<Mission[]> {
    return this.missionRepo.getRecentCompleted(userId, days);
  }
}
