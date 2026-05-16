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

import { MissionService } from '../../services/MissionService';
import { MissionRepository } from '../../repositories/MissionRepository';
import { GoalRepository } from '../../repositories/GoalRepository';
import { HabitRepository } from '../../repositories/HabitRepository';
import { GoalService } from '../../services/GoalService';
import { Mission } from '../../types';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  user_id: 'user-1',
  title: 'Write API',
  habit_category_id: null,
  eta_minutes: 60,
  status: 'active',
  started_at: new Date(),
  completed_at: null,
  paused_at: null,
  actual_duration_minutes: null,
  notes: null,
  created_at: new Date(),
  ...overrides,
});

describe('MissionService', () => {
  let missionRepo: jest.Mocked<MissionRepository>;
  let goalRepo: jest.Mocked<GoalRepository>;
  let habitRepo: jest.Mocked<HabitRepository>;
  let goalService: jest.Mocked<GoalService>;
  let service: MissionService;

  beforeEach(() => {
    missionRepo = {
      create: jest.fn(),
      getActive: jest.fn(),
      getById: jest.fn(),
      updateStatus: jest.fn(),
      extendEta: jest.fn(),
      getRecentCompleted: jest.fn(),
      markEtaExpired: jest.fn(),
    } as unknown as jest.Mocked<MissionRepository>;

    goalRepo = {
      getActiveByCategory: jest.fn(),
    } as unknown as jest.Mocked<GoalRepository>;

    habitRepo = {
      getCategoryByName: jest.fn(),
    } as unknown as jest.Mocked<HabitRepository>;

    goalService = {
      logProgress: jest.fn(),
    } as unknown as jest.Mocked<GoalService>;

    service = new MissionService(missionRepo, goalRepo, habitRepo, goalService);
  });

  describe('start', () => {
    it('starts a mission without category', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      missionRepo.create.mockResolvedValue(makeMission({ habit_category_id: null }));

      const mission = await service.start('user-1', 'Write API', '1h', null);

      expect(missionRepo.create).toHaveBeenCalledWith('user-1', 'Write API', null, 60);
      expect(mission.title).toBe('Write API');
    });

    it('starts a mission with category', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      habitRepo.getCategoryByName.mockResolvedValue({
        id: 'cat-1',
        user_id: 'user-1',
        name: 'exercise',
        description: null,
        created_at: new Date(),
      });
      missionRepo.create.mockResolvedValue(makeMission({ habit_category_id: 'cat-1' }));

      const mission = await service.start('user-1', 'Tennis', '90m', 'exercise');

      expect(habitRepo.getCategoryByName).toHaveBeenCalledWith('user-1', 'exercise');
      expect(missionRepo.create).toHaveBeenCalledWith('user-1', 'Tennis', 'cat-1', 90);
      expect(mission.habit_category_id).toBe('cat-1');
    });

    it('throws when another mission is already active', async () => {
      missionRepo.getActive.mockResolvedValue(makeMission({ title: 'Existing Mission' }));

      await expect(service.start('user-1', 'New Mission', null, null)).rejects.toThrow(
        'Active mission already running'
      );
    });

    it('throws when category name not found', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      habitRepo.getCategoryByName.mockResolvedValue(null);

      await expect(service.start('user-1', 'Tennis', null, 'nonexistent')).rejects.toThrow(
        'Category "nonexistent" not found'
      );
    });
  });

  describe('complete', () => {
    it('completes mission and returns no goal progress if no category', async () => {
      const activeMission = makeMission({ habit_category_id: null });
      const completedMission = makeMission({ status: 'completed', actual_duration_minutes: 45 });
      missionRepo.getActive.mockResolvedValue(activeMission);
      missionRepo.updateStatus.mockResolvedValue(completedMission);

      const result = await service.complete('user-1', '45m', null);

      expect(missionRepo.updateStatus).toHaveBeenCalledWith(
        'mission-1',
        'completed',
        expect.objectContaining({ actual_duration_minutes: 45 })
      );
      expect(result.mission.status).toBe('completed');
      expect(result.goalProgress).toBeNull();
    });

    it('logs goal progress when mission has a category', async () => {
      const activeMission = makeMission({ habit_category_id: 'cat-1' });
      const completedMission = makeMission({ status: 'completed', actual_duration_minutes: 90 });
      const mockGoal = { id: 'goal-1', status: 'active' } as any;
      const mockProgress = {
        goal: mockGoal,
        progressLog: { value_delta: 90 } as any,
        totalProgress: 90,
        milestonesUnlocked: [] as any[],
        goalCompleted: false,
      } as any;

      missionRepo.getActive.mockResolvedValue(activeMission);
      missionRepo.updateStatus.mockResolvedValue(completedMission);
      goalRepo.getActiveByCategory.mockResolvedValue(mockGoal);
      goalService.logProgress.mockResolvedValue(mockProgress);

      const result = await service.complete('user-1', '90m', null);

      expect(goalService.logProgress).toHaveBeenCalledWith(
        'goal-1',
        90,
        'minutes',
        'mission-1',
        null
      );
      expect(result.goalProgress).not.toBeNull();
      expect(result.goalProgress?.progressLog.value_delta).toBe(90);
    });

    it('throws when no active mission', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      await expect(service.complete('user-1', null, null)).rejects.toThrow('No active mission');
    });
  });

  describe('abort', () => {
    it('marks mission as failed', async () => {
      missionRepo.getActive.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(makeMission({ status: 'failed' }));

      const result = await service.abort('user-1');

      expect(missionRepo.updateStatus).toHaveBeenCalledWith('mission-1', 'failed');
      expect(result.status).toBe('failed');
    });

    it('throws when no active mission', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      await expect(service.abort('user-1')).rejects.toThrow('No active mission');
    });
  });

  describe('extend', () => {
    it('adds time to ETA', async () => {
      missionRepo.getActive.mockResolvedValue(makeMission({ eta_minutes: 60 }));
      missionRepo.extendEta.mockResolvedValue(makeMission({ eta_minutes: 90 }));

      const result = await service.extend('user-1', '30m');

      expect(missionRepo.extendEta).toHaveBeenCalledWith('mission-1', 30);
      expect(result.eta_minutes).toBe(90);
    });
  });
});
