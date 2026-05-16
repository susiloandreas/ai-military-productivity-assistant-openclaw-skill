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

import { HabitService } from '../../services/HabitService';
import { HabitRepository } from '../../repositories/HabitRepository';
import { GoalRepository } from '../../repositories/GoalRepository';
import { GoalService } from '../../services/GoalService';
import { HabitLog } from '../../types';

const makeHabitLog = (overrides: Partial<HabitLog> = {}): HabitLog => ({
  id: 'log-1',
  habit_type_id: 'ht-1',
  user_id: 'user-1',
  duration_minutes: 60,
  logged_at: new Date(),
  note: null,
  ...overrides,
});

describe('HabitService', () => {
  let habitRepo: jest.Mocked<HabitRepository>;
  let goalRepo: jest.Mocked<GoalRepository>;
  let goalService: jest.Mocked<GoalService>;
  let service: HabitService;

  beforeEach(() => {
    habitRepo = {
      getCategoryByName: jest.fn(),
      upsertHabitType: jest.fn(),
      createLog: jest.fn(),
    } as unknown as jest.Mocked<HabitRepository>;

    goalRepo = {
      getActiveByCategory: jest.fn(),
    } as unknown as jest.Mocked<GoalRepository>;

    goalService = {
      logProgress: jest.fn(),
    } as unknown as jest.Mocked<GoalService>;

    service = new HabitService(habitRepo, goalRepo, goalService);
  });

  describe('logRetroactive', () => {
    it('logs a habit with no linked goal', async () => {
      habitRepo.getCategoryByName.mockResolvedValue({
        id: 'cat-1', user_id: 'user-1', name: 'exercise', description: null, created_at: new Date(),
      });
      habitRepo.upsertHabitType.mockResolvedValue({
        id: 'ht-1', habit_category_id: 'cat-1', name: 'running', unit: 'minutes', created_at: new Date(),
      });
      habitRepo.createLog.mockResolvedValue(makeHabitLog());
      goalRepo.getActiveByCategory.mockResolvedValue(null);

      const result = await service.logRetroactive('user-1', 'exercise', 'running', '60m');
      expect(result.habitLog.duration_minutes).toBe(60);
      expect(result.goalProgress).toBeNull();
    });

    it('logs goal progress when active goal found', async () => {
      habitRepo.getCategoryByName.mockResolvedValue({
        id: 'cat-1', user_id: 'user-1', name: 'exercise', description: null, created_at: new Date(),
      });
      habitRepo.upsertHabitType.mockResolvedValue({
        id: 'ht-1', habit_category_id: 'cat-1', name: 'running', unit: 'minutes', created_at: new Date(),
      });
      habitRepo.createLog.mockResolvedValue(makeHabitLog());
      goalRepo.getActiveByCategory.mockResolvedValue({ id: 'goal-1', status: 'active' } as any);
      goalService.logProgress.mockResolvedValue({
        goal: {} as any,
        progressLog: {} as any,
        totalProgress: 60,
        milestonesUnlocked: [],
        goalCompleted: false,
      });

      const result = await service.logRetroactive('user-1', 'exercise', 'running', '60m');
      expect(goalService.logProgress).toHaveBeenCalledWith(
        'goal-1', 60, 'minutes', null, 'log-1'
      );
      expect(result.goalProgress).not.toBeNull();
    });

    it('throws when category not found', async () => {
      habitRepo.getCategoryByName.mockResolvedValue(null);
      await expect(
        service.logRetroactive('user-1', 'unknown', 'running', '60m')
      ).rejects.toThrow('Category "unknown" not found');
    });
  });
});
