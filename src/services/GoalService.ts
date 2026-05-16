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
    sourceMissionId: string | null,
    sourceHabitLogId: string | null
  ): Promise<ProgressResult> {
    const goal = await this.goalRepo.getById(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found`);
    if (goal.status !== 'active') throw new Error(`Goal ${goalId} is not active`);

    const progressLog = await this.goalRepo.addProgressLog(
      goalId,
      valueDelta,
      unit,
      sourceMissionId,
      sourceHabitLogId
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
    { goal: Goal; totalProgress: number; milestones: Milestone[]; categoryName: string }[]
  > {
    const goals = await this.goalRepo.getAllActive(userId);
    return Promise.all(
      goals.map(async goal => {
        const totalProgress = await this.goalRepo.getTotalProgress(goal.id);
        const milestones = await this.goalRepo.getMilestones(goal.id);
        const category = await this.habitRepo.getCategoryById(goal.habit_category_id);
        return { goal, totalProgress, milestones, categoryName: category?.name ?? 'Unknown' };
      })
    );
  }
}
