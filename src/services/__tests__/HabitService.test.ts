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
import { MissionRepository } from '../../repositories/MissionRepository';
import { GoalService } from '../../services/GoalService';

describe('HabitService', () => {
  let habitRepo: jest.Mocked<HabitRepository>;
  let missionRepo: jest.Mocked<MissionRepository>;
  let goalService: jest.Mocked<GoalService>;
  let service: HabitService;

  beforeEach(() => {
    habitRepo = {
      getCategoryByName: jest.fn(),
      createCategory: jest.fn(),
      getAllCategories: jest.fn(),
      upsertHabitType: jest.fn(),
      createSchedule: jest.fn(),
      getActiveSchedules: jest.fn(),
    } as unknown as jest.Mocked<HabitRepository>;

    missionRepo = {
      getWeeklyCategorySummary: jest.fn(),
    } as unknown as jest.Mocked<MissionRepository>;

    goalService = {
      createHabitGoal: jest.fn(),
    } as unknown as jest.Mocked<GoalService>;

    service = new HabitService(habitRepo, missionRepo, goalService);
  });

  describe('addCategory', () => {
    it('creates a category when none exists', async () => {
      habitRepo.getCategoryByName.mockResolvedValue(null);
      habitRepo.createCategory.mockResolvedValue({
        id: 'cat-1', user_id: 'user-1', name: 'exercise', description: null, created_at: new Date(),
      });

      const cat = await service.addCategory('user-1', 'exercise');
      expect(habitRepo.createCategory).toHaveBeenCalledWith('user-1', 'exercise', undefined);
      expect(cat.name).toBe('exercise');
    });

    it('throws when category already exists', async () => {
      habitRepo.getCategoryByName.mockResolvedValue({
        id: 'cat-1', user_id: 'user-1', name: 'exercise', description: null, created_at: new Date(),
      });
      await expect(service.addCategory('user-1', 'exercise')).rejects.toThrow('already exists');
    });
  });

  describe('getWeeklySummary', () => {
    it('delegates to the mission repository (retroactive activity totals)', async () => {
      missionRepo.getWeeklyCategorySummary.mockResolvedValue([
        { habit_category_id: 'cat-1', name: 'exercise', total_minutes: 180 },
      ]);
      const summary = await service.getWeeklySummary('user-1');
      expect(missionRepo.getWeeklyCategorySummary).toHaveBeenCalledWith('user-1');
      expect(summary[0]).toMatchObject({ name: 'exercise', total_minutes: 180 });
    });
  });

  describe('setHabitGoal', () => {
    it('parses the target duration and delegates to GoalService', async () => {
      goalService.createHabitGoal.mockResolvedValue({
        goal: { title: 'running goal' } as any,
        milestone: { target_value: 3000 } as any,
      });
      await service.setHabitGoal('user-1', 'exercise', 'running', '50h');
      expect(goalService.createHabitGoal).toHaveBeenCalledWith(
        'user-1', 'exercise', 'running', 3000, null
      );
    });
  });
});
