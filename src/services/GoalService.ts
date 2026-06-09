import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { Goal, Milestone, GoalProgressLog } from '../types';

export interface ProgressResult {
  goal: Goal;
  progressLog: GoalProgressLog;
  totalProgress: number;
  milestonesUnlocked: Milestone[];
  goalCompleted: boolean;
}

export class GoalService {
  constructor(
    private goalRepo: GoalRepository,
    private habitRepo: HabitRepository
  ) {}

  async getOrCreateGoalForCategory(
    userId: string,
    categoryName: string
  ): Promise<{ goal: Goal; categoryId: string } | null> {
    const category = await this.habitRepo.getCategoryByName(userId, categoryName);
    if (!category) return null;
    const goal = await this.goalRepo.getActiveByCategory(category.id);
    if (!goal) return null;
    return { goal, categoryId: category.id };
  }

  async logProgress(
    goalId: string,
    valueDelta: number,
    unit: string,
    sourceMissionId: string | null
  ): Promise<ProgressResult> {
    const goal = await this.goalRepo.getById(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found`);
    if (goal.status !== 'active') throw new Error(`Goal ${goalId} is not active`);

    const progressLog = await this.goalRepo.addProgressLog(
      goalId,
      valueDelta,
      unit,
      sourceMissionId
    );

    const totalProgress = await this.goalRepo.getTotalProgress(goalId);
    const milestones = await this.goalRepo.getMilestones(goalId);

    const milestonesUnlocked: Milestone[] = [];
    for (const m of milestones) {
      if (!m.achieved_at && totalProgress >= m.target_value) {
        const achieved = await this.goalRepo.achieveMilestone(m.id);
        milestonesUnlocked.push(achieved);
      }
    }

    let goalCompleted = false;
    if (milestonesUnlocked.some(m => m.is_final_exam)) {
      await this.goalRepo.updateStatus(goalId, 'achieved');
      goalCompleted = true;
    }

    const updatedGoal = (await this.goalRepo.getById(goalId))!;
    return { goal: updatedGoal, progressLog, totalProgress, milestonesUnlocked, goalCompleted };
  }

  async getGoalStatus(userId: string): Promise<
    {
      goal: Goal;
      totalProgress: number;
      milestones: Milestone[];
      categoryName: string;
      habitTypeName: string | null;
    }[]
  > {
    const goals = await this.goalRepo.getAllActive(userId);
    return Promise.all(
      goals.map(async goal => {
        const totalProgress = await this.goalRepo.getTotalProgress(goal.id);
        const milestones = await this.goalRepo.getMilestones(goal.id);
        const category = await this.habitRepo.getCategoryById(goal.habit_category_id);
        const habitType = goal.habit_type_id
          ? await this.habitRepo.getHabitTypeById(goal.habit_type_id)
          : null;
        return {
          goal,
          totalProgress,
          milestones,
          categoryName: category?.name ?? 'Unknown',
          habitTypeName: habitType?.name ?? null,
        };
      })
    );
  }

  /**
   * Create a goal tied to a specific habit type, with a single final-exam
   * milestone at `targetMinutes`. Logging that habit then auto-advances the goal,
   * which is marked achieved once the target is reached. Creates the habit type
   * if it does not yet exist under the category.
   */
  async createHabitGoal(
    userId: string,
    categoryName: string,
    habitTypeName: string,
    targetMinutes: number,
    deadline: Date | null = null
  ): Promise<{ goal: Goal; milestone: Milestone }> {
    const category = await this.habitRepo.getCategoryByName(userId, categoryName);
    if (!category) throw new Error(`Category "${categoryName}" not found.`);

    const habitType = await this.habitRepo.upsertHabitType(category.id, habitTypeName);

    const existing = await this.goalRepo.getActiveByHabitType(habitType.id);
    if (existing) throw new Error(`An active goal for "${habitTypeName}" already exists.`);

    const goal = await this.goalRepo.create(
      userId,
      category.id,
      `${habitTypeName} goal`,
      null,
      deadline,
      habitType.id,
      targetMinutes / 60
    );
    const milestone = await this.goalRepo.addMilestone(
      goal.id,
      `${targetMinutes} minutes total`,
      targetMinutes,
      'minutes',
      true
    );
    return { goal, milestone };
  }
}
