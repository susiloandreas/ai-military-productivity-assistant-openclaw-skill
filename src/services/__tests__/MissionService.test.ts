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
  habit_type_id: null,
  eta_minutes: 60,
  mode: 'live',
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
      createRetroactive: jest.fn(),
      getActive: jest.fn(),
      getById: jest.fn(),
      updateStatus: jest.fn(),
      extendEta: jest.fn(),
      getRecentCompleted: jest.fn(),
      markEtaExpired: jest.fn(),
      getHeld: jest.fn(),
      getAwaitingNotes: jest.fn(),
      setAwaitingNotes: jest.fn(),
      appendNotes: jest.fn(),
    } as unknown as jest.Mocked<MissionRepository>;

    goalRepo = {
      getActiveByCategory: jest.fn(),
      getActiveByHabitType: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<GoalRepository>;

    habitRepo = {
      getCategoryByName: jest.fn(),
      upsertHabitType: jest.fn(),
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

      const { mission, heldMission } = await service.start('user-1', 'Write API', '1h', null);

      expect(missionRepo.create).toHaveBeenCalledWith('user-1', 'Write API', null, 60);
      expect(mission.title).toBe('Write API');
      expect(heldMission).toBeNull();
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

      const { mission } = await service.start('user-1', 'Tennis', '90m', 'exercise');

      expect(habitRepo.getCategoryByName).toHaveBeenCalledWith('user-1', 'exercise');
      expect(missionRepo.create).toHaveBeenCalledWith('user-1', 'Tennis', 'cat-1', 90);
      expect(mission.habit_category_id).toBe('cat-1');
    });

    it('puts the existing active mission on hold instead of rejecting the new one', async () => {
      const existing = makeMission({ id: 'old-id', title: 'Existing Mission' });
      missionRepo.getActive.mockResolvedValue(existing);
      missionRepo.updateStatus.mockResolvedValue(
        makeMission({ id: 'old-id', title: 'Existing Mission', status: 'paused' })
      );
      missionRepo.create.mockResolvedValue(makeMission({ id: 'new-id', title: 'New Mission' }));

      const { mission, heldMission } = await service.start('user-1', 'New Mission', null, null);

      expect(missionRepo.updateStatus).toHaveBeenCalledWith('old-id', 'paused');
      expect(missionRepo.create).toHaveBeenCalledWith('user-1', 'New Mission', null, null);
      expect(mission.title).toBe('New Mission');
      expect(heldMission?.status).toBe('paused');
      expect(heldMission?.title).toBe('Existing Mission');
    });

    it('does not hold any mission when the category is invalid', async () => {
      missionRepo.getActive.mockResolvedValue(makeMission({ title: 'Existing Mission' }));
      habitRepo.getCategoryByName.mockResolvedValue(null);

      await expect(service.start('user-1', 'New Mission', null, 'nope')).rejects.toThrow(
        'Category "nope" not found'
      );
      expect(missionRepo.updateStatus).not.toHaveBeenCalled();
      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('throws when category name not found', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      habitRepo.getCategoryByName.mockResolvedValue(null);

      await expect(service.start('user-1', 'Tennis', null, 'nonexistent')).rejects.toThrow(
        'Category "nonexistent" not found'
      );
    });
  });

  describe('notes follow-up', () => {
    it('flags a mission to await notes', async () => {
      await service.requestNotes('m-1');
      expect(missionRepo.setAwaitingNotes).toHaveBeenCalledWith('m-1', true);
    });

    it('clears a pending notes request', async () => {
      await service.clearNotesRequest('m-1');
      expect(missionRepo.setAwaitingNotes).toHaveBeenCalledWith('m-1', false);
    });

    it('records notes via the repository', async () => {
      const updated = makeMission({ notes: 'fixed the parser' });
      missionRepo.appendNotes.mockResolvedValue(updated);

      const result = await service.recordNotes('m-1', 'fixed the parser');

      expect(missionRepo.appendNotes).toHaveBeenCalledWith('m-1', 'fixed the parser');
      expect(result.notes).toBe('fixed the parser');
    });

    it('returns the mission awaiting notes', async () => {
      const awaiting = makeMission({ awaiting_notes: true });
      missionRepo.getAwaitingNotes.mockResolvedValue(awaiting);

      expect(await service.getMissionAwaitingNotes('user-1')).toBe(awaiting);
      expect(missionRepo.getAwaitingNotes).toHaveBeenCalledWith('user-1');
    });
  });

  describe('resolveExpiredMission', () => {
    it('marks a not-completed expiry as failed with notes, no goal progress', async () => {
      missionRepo.getById.mockResolvedValue(makeMission({ id: 'x', status: 'eta_expired' }));
      missionRepo.updateStatus.mockResolvedValue(makeMission({ id: 'x', status: 'failed', notes: 'ran out' }));

      const result = await service.resolveExpiredMission('x', false, 'ran out');

      expect(missionRepo.updateStatus).toHaveBeenCalledWith('x', 'failed', { notes: 'ran out' });
      expect(missionRepo.setAwaitingNotes).toHaveBeenCalledWith('x', false);
      expect(result.mission.status).toBe('failed');
      expect(result.goalProgress).toBeNull();
    });

    it('marks a completed expiry with elapsed duration + notes and advances goals', async () => {
      const started = new Date(Date.now() - 30 * 60000); // 30 min ago
      missionRepo.getById.mockResolvedValue(
        makeMission({ id: 'x', status: 'eta_expired', started_at: started, habit_category_id: 'cat-1' })
      );
      missionRepo.updateStatus.mockResolvedValue(
        makeMission({ id: 'x', status: 'completed', habit_category_id: 'cat-1', actual_duration_minutes: 30 })
      );
      goalRepo.getActiveByCategory.mockResolvedValue(null);

      const result = await service.resolveExpiredMission('x', true, 'wrapped up');

      expect(missionRepo.updateStatus).toHaveBeenCalledWith(
        'x',
        'completed',
        expect.objectContaining({ notes: 'wrapped up' })
      );
      const call = missionRepo.updateStatus.mock.calls[0][2] as { actual_duration_minutes: number };
      expect(call.actual_duration_minutes).toBeGreaterThanOrEqual(29);
      expect(missionRepo.setAwaitingNotes).toHaveBeenCalledWith('x', false);
      expect(result.mission.status).toBe('completed');
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
        'mission-1'
      );
      expect(result.goalProgress).not.toBeNull();
      expect(result.goalProgress?.progressLog.value_delta).toBe(90);
    });

    it('throws when no active mission', async () => {
      missionRepo.getActive.mockResolvedValue(null);
      await expect(service.complete('user-1', null, null)).rejects.toThrow('No active mission');
    });
  });

  describe('logRetroactive', () => {
    const setupCategoryAndType = () => {
      habitRepo.getCategoryByName.mockResolvedValue({
        id: 'cat-1', user_id: 'user-1', name: 'exercise', description: null, created_at: new Date(),
      });
      habitRepo.upsertHabitType.mockResolvedValue({
        id: 'ht-1', habit_category_id: 'cat-1', name: 'running', unit: 'minutes', created_at: new Date(),
      });
      missionRepo.createRetroactive.mockResolvedValue(
        makeMission({
          mode: 'retroactive',
          status: 'completed',
          habit_category_id: 'cat-1',
          habit_type_id: 'ht-1',
          actual_duration_minutes: 60,
        })
      );
    };

    it('records a retroactive mission with no linked goal', async () => {
      setupCategoryAndType();
      goalRepo.getActiveByCategory.mockResolvedValue(null);

      const result = await service.logRetroactive('user-1', 'exercise', 'running', '60m', null);

      expect(missionRepo.createRetroactive).toHaveBeenCalledWith(
        'user-1', 'running', 'cat-1', 'ht-1', 60, null
      );
      expect(result.mission.actual_duration_minutes).toBe(60);
      expect(result.goalProgress).toBeNull();
      expect(result.habitGoalProgress).toBeNull();
    });

    it('advances the category goal when one is active', async () => {
      setupCategoryAndType();
      goalRepo.getActiveByCategory.mockResolvedValue({ id: 'goal-1', status: 'active' } as any);
      goalService.logProgress.mockResolvedValue({
        goal: {} as any, progressLog: {} as any, totalProgress: 60,
        milestonesUnlocked: [], goalCompleted: false,
      });

      const result = await service.logRetroactive('user-1', 'exercise', 'running', '60m', null);

      expect(goalService.logProgress).toHaveBeenCalledWith('goal-1', 60, 'minutes', 'mission-1');
      expect(result.goalProgress).not.toBeNull();
    });

    it('advances a goal tied to the specific habit type', async () => {
      setupCategoryAndType();
      goalRepo.getActiveByCategory.mockResolvedValue(null);
      goalRepo.getActiveByHabitType.mockResolvedValue({ id: 'run-goal', status: 'active' } as any);
      goalService.logProgress.mockResolvedValue({
        goal: {} as any, progressLog: {} as any, totalProgress: 60,
        milestonesUnlocked: [], goalCompleted: false,
      });

      const result = await service.logRetroactive('user-1', 'exercise', 'running', '60m', null);

      expect(goalRepo.getActiveByHabitType).toHaveBeenCalledWith('ht-1');
      expect(goalService.logProgress).toHaveBeenCalledWith('run-goal', 60, 'minutes', 'mission-1');
      expect(result.habitGoalProgress).not.toBeNull();
      expect(result.goalProgress).toBeNull();
    });

    it('throws when category not found', async () => {
      habitRepo.getCategoryByName.mockResolvedValue(null);
      await expect(
        service.logRetroactive('user-1', 'unknown', 'running', '60m', null)
      ).rejects.toThrow('Category "unknown" not found');
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
