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

import { TennisService } from '../../services/TennisService';
import { TennisRepository } from '../../repositories/TennisRepository';
import { MissionService } from '../../services/MissionService';
import { TennisTrainingLog, Mission } from '../../types';

const makeLog = (): TennisTrainingLog => ({
  id: 'log-1',
  user_id: 'user-1',
  mission_id: null,
  session_type: 'serve',
  duration_minutes: 60,
  notes: null,
  logged_at: new Date(),
});

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  user_id: 'user-1',
  title: 'Tennis: serve',
  habit_category_id: 'cat-tennis',
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

describe('TennisService', () => {
  let tennisRepo: jest.Mocked<TennisRepository>;
  let missionService: jest.Mocked<MissionService>;
  let service: TennisService;

  beforeEach(() => {
    tennisRepo = {
      create: jest.fn(),
      getWeeklySummary: jest.fn(),
      getWeeklyTotalMinutes: jest.fn(),
      getLastSessionDate: jest.fn(),
    } as unknown as jest.Mocked<TennisRepository>;

    missionService = {
      start: jest.fn(),
      complete: jest.fn(),
      getActiveMission: jest.fn(),
    } as unknown as jest.Mocked<MissionService>;

    service = new TennisService(tennisRepo, missionService);
  });

  describe('startSession', () => {
    it('starts a mission with tennis category', async () => {
      missionService.start.mockResolvedValue(makeMission());
      const result = await service.startSession('user-1', 'serve', null);
      expect(missionService.start).toHaveBeenCalledWith('user-1', 'Tennis: serve', null, 'tennis');
      expect(result.missionId).toBe('mission-1');
    });
  });

  describe('completeSession', () => {
    it('creates a training log without active mission', async () => {
      missionService.getActiveMission.mockResolvedValue(null);
      tennisRepo.create.mockResolvedValue(makeLog());

      const result = await service.completeSession('user-1', 'serve', '60m');
      expect(tennisRepo.create).toHaveBeenCalled();
      expect(result.missionId).toBeNull();
    });

    it('completes active mission and links training log', async () => {
      missionService.getActiveMission.mockResolvedValue(makeMission());
      missionService.complete.mockResolvedValue({
        mission: makeMission({ status: 'completed' }),
        goalProgress: null,
      });
      tennisRepo.create.mockResolvedValue({ ...makeLog(), mission_id: 'mission-1' });

      const result = await service.completeSession('user-1', 'serve', '60m');
      expect(missionService.complete).toHaveBeenCalled();
      expect(result.missionId).toBe('mission-1');
    });
  });

  describe('getWeeklySummary', () => {
    it('returns session rows and total minutes', async () => {
      tennisRepo.getWeeklySummary.mockResolvedValue([
        { session_type: 'serve', total_minutes: 60, session_count: 1 } as any,
      ]);
      tennisRepo.getWeeklyTotalMinutes.mockResolvedValue(60);

      const result = await service.getWeeklySummary('user-1');
      expect(result.totalMinutes).toBe(60);
      expect(result.sessions).toHaveLength(1);
    });
  });
});
