// Mock the DB connection before any imports that use it
jest.mock('../../db/connection', () => ({
  pool: { query: jest.fn() },
  redisConnection: { options: {} },
}));
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(true),
  })),
  Worker: jest.fn(),
}));

import { GoalService } from '../../services/GoalService';
import { GoalRepository } from '../../repositories/GoalRepository';
import { HabitRepository } from '../../repositories/HabitRepository';
import { Goal, Milestone, GoalProgressLog } from '../../types';

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1',
  user_id: 'user-1',
  habit_category_id: 'cat-1',
  habit_type_id: null,
  title: 'Intermediate Tennis',
  target_description: null,
  deadline: null,
  status: 'active',
  created_at: new Date(),
  ...overrides,
});

const makeMilestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: 'ms-1',
  goal_id: 'goal-1',
  title: 'First milestone',
  target_value: 600,
  unit: 'minutes',
  is_final_exam: false,
  achieved_at: null,
  created_at: new Date(),
  ...overrides,
});

const makeProgressLog = (overrides: Partial<GoalProgressLog> = {}): GoalProgressLog => ({
  id: 'log-1',
  goal_id: 'goal-1',
  value_delta: 90,
  unit: 'minutes',
  source_mission_id: 'mission-1',
  logged_at: new Date(),
  ...overrides,
});

describe('GoalService', () => {
  let goalRepo: jest.Mocked<GoalRepository>;
  let habitRepo: jest.Mocked<HabitRepository>;
  let service: GoalService;

  beforeEach(() => {
    goalRepo = {
      create: jest.fn(),
      getActiveByCategory: jest.fn(),
      getById: jest.fn(),
      getAllActive: jest.fn(),
      updateStatus: jest.fn(),
      addMilestone: jest.fn(),
      getMilestones: jest.fn(),
      achieveMilestone: jest.fn(),
      addProgressLog: jest.fn(),
      getTotalProgress: jest.fn(),
      getProgressLogs: jest.fn(),
    } as unknown as jest.Mocked<GoalRepository>;

    habitRepo = {
      createCategory: jest.fn(),
      getCategoryByName: jest.fn(),
      getCategoryById: jest.fn(),
      getAllCategories: jest.fn(),
      upsertHabitType: jest.fn(),
      getHabitTypeByName: jest.fn(),
    } as unknown as jest.Mocked<HabitRepository>;

    service = new GoalService(goalRepo, habitRepo);
  });

  describe('logProgress', () => {
    it('logs progress and returns result with no milestones unlocked', async () => {
      const goal = makeGoal();
      const progressLog = makeProgressLog();
      const milestone = makeMilestone({ target_value: 600 });

      goalRepo.getById.mockResolvedValue(goal);
      goalRepo.addProgressLog.mockResolvedValue(progressLog);
      goalRepo.getTotalProgress.mockResolvedValue(90); // below 600
      goalRepo.getMilestones.mockResolvedValue([milestone]);

      const result = await service.logProgress('goal-1', 90, 'minutes', 'mission-1');

      expect(result.progressLog.value_delta).toBe(90);
      expect(result.totalProgress).toBe(90);
      expect(result.milestonesUnlocked).toHaveLength(0);
      expect(result.goalCompleted).toBe(false);
    });

    it('unlocks a milestone when total progress crosses threshold', async () => {
      const goal = makeGoal();
      const progressLog = makeProgressLog({ value_delta: 600 });
      const milestone = makeMilestone({ target_value: 600 });
      const achievedMilestone = { ...milestone, achieved_at: new Date() };

      goalRepo.getById.mockResolvedValue(goal);
      goalRepo.addProgressLog.mockResolvedValue(progressLog);
      goalRepo.getTotalProgress.mockResolvedValue(600);
      goalRepo.getMilestones.mockResolvedValue([milestone]);
      goalRepo.achieveMilestone.mockResolvedValue(achievedMilestone);
      goalRepo.getById.mockResolvedValueOnce(goal).mockResolvedValueOnce(goal);

      const result = await service.logProgress('goal-1', 600, 'minutes', 'mission-1');

      expect(goalRepo.achieveMilestone).toHaveBeenCalledWith('ms-1');
      expect(result.milestonesUnlocked).toHaveLength(1);
      expect(result.milestonesUnlocked[0].id).toBe('ms-1');
    });

    it('completes goal when final exam milestone is achieved', async () => {
      const goal = makeGoal();
      const progressLog = makeProgressLog({ value_delta: 3000 });
      const finalMilestone = makeMilestone({
        id: 'ms-final',
        target_value: 3000,
        is_final_exam: true,
      });
      const achievedFinal = { ...finalMilestone, achieved_at: new Date() };

      goalRepo.getById.mockResolvedValue(goal);
      goalRepo.addProgressLog.mockResolvedValue(progressLog);
      goalRepo.getTotalProgress.mockResolvedValue(3000);
      goalRepo.getMilestones.mockResolvedValue([finalMilestone]);
      goalRepo.achieveMilestone.mockResolvedValue(achievedFinal);
      goalRepo.updateStatus.mockResolvedValue({ ...goal, status: 'achieved' });
      goalRepo.getById
        .mockResolvedValueOnce(goal)
        .mockResolvedValueOnce({ ...goal, status: 'achieved' });

      const result = await service.logProgress('goal-1', 3000, 'minutes', null);

      expect(goalRepo.updateStatus).toHaveBeenCalledWith('goal-1', 'achieved');
      expect(result.goalCompleted).toBe(true);
    });

    it('throws when goal not found', async () => {
      goalRepo.getById.mockResolvedValue(null);
      await expect(service.logProgress('bad-id', 90, 'minutes', null)).rejects.toThrow(
        'Goal bad-id not found'
      );
    });

    it('throws when goal is not active', async () => {
      goalRepo.getById.mockResolvedValue(makeGoal({ status: 'achieved' }));
      await expect(service.logProgress('goal-1', 90, 'minutes', null)).rejects.toThrow(
        'not active'
      );
    });
  });

  describe('getGoalStatus', () => {
    it('returns enriched goal list with category name', async () => {
      const goal = makeGoal();
      const milestone = makeMilestone();

      goalRepo.getAllActive.mockResolvedValue([goal]);
      goalRepo.getTotalProgress.mockResolvedValue(120);
      goalRepo.getMilestones.mockResolvedValue([milestone]);
      habitRepo.getCategoryById.mockResolvedValue({
        id: 'cat-1',
        user_id: 'user-1',
        name: 'tennis',
        description: null,
        created_at: new Date(),
      });

      const result = await service.getGoalStatus('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('tennis');
      expect(result[0].totalProgress).toBe(120);
    });
  });
});
