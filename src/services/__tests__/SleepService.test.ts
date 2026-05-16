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

import { SleepService } from '../../services/SleepService';
import { SleepRepository } from '../../repositories/SleepRepository';
import { SleepLog } from '../../types';

const makeSleepLog = (overrides: Partial<SleepLog> = {}): SleepLog => ({
  id: 'sleep-1',
  user_id: 'user-1',
  duration_minutes: 480,
  wake_time: '06:30:00',
  sleep_quality: 'good',
  notes: null,
  logged_at: new Date(),
  ...overrides,
});

describe('SleepService', () => {
  let sleepRepo: jest.Mocked<SleepRepository>;
  let service: SleepService;

  beforeEach(() => {
    sleepRepo = {
      create: jest.fn(),
      getRecent: jest.fn(),
      getLastLog: jest.fn(),
      getDebtMinutes: jest.fn(),
      getAverageQualityScore: jest.fn(),
    } as unknown as jest.Mocked<SleepRepository>;

    service = new SleepService(sleepRepo);
  });

  describe('log', () => {
    it('logs sleep and returns debt/quality', async () => {
      const log = makeSleepLog();
      sleepRepo.create.mockResolvedValue(log);
      sleepRepo.getDebtMinutes.mockResolvedValue(0);
      sleepRepo.getAverageQualityScore.mockResolvedValue(3.5);

      const result = await service.log('user-1', 480, null, 'good');

      expect(sleepRepo.create).toHaveBeenCalledWith('user-1', 480, null, 'good', undefined);
      expect(result.log.duration_minutes).toBe(480);
      expect(result.debtMinutes).toBe(0);
      expect(result.averageQuality).toBe(3.5);
    });
  });

  describe('getStatus', () => {
    it('returns status with last log, debt, and quality', async () => {
      const log = makeSleepLog();
      sleepRepo.getLastLog.mockResolvedValue(log);
      sleepRepo.getDebtMinutes.mockResolvedValue(30);
      sleepRepo.getAverageQualityScore.mockResolvedValue(2.8);
      sleepRepo.getRecent.mockResolvedValue([log]);

      const status = await service.getStatus('user-1');

      expect(status.lastLog).not.toBeNull();
      expect(status.debtMinutes).toBe(30);
      expect(status.averageQuality).toBe(2.8);
    });

    it('returns nulls when no data exists', async () => {
      sleepRepo.getLastLog.mockResolvedValue(null);
      sleepRepo.getDebtMinutes.mockResolvedValue(0);
      sleepRepo.getAverageQualityScore.mockResolvedValue(0);
      sleepRepo.getRecent.mockResolvedValue([]);

      const status = await service.getStatus('user-1');

      expect(status.lastLog).toBeNull();
      expect(status.recentLogs).toHaveLength(0);
    });
  });

  describe('getReadinessLabel', () => {
    it('returns PEAK for zero debt and high quality', () => {
      expect(service.getReadinessLabel(0, 3.5)).toBe('PEAK');
    });

    it('returns OPTIMAL for low debt and good quality', () => {
      expect(service.getReadinessLabel(20, 3)).toBe('OPTIMAL');
    });

    it('returns ADEQUATE for moderate debt and fair quality', () => {
      expect(service.getReadinessLabel(50, 2)).toBe('ADEQUATE');
    });

    it('returns DEGRADED for significant debt', () => {
      expect(service.getReadinessLabel(100, 1)).toBe('DEGRADED');
    });

    it('returns CRITICAL for severe debt', () => {
      expect(service.getReadinessLabel(150, 1)).toBe('CRITICAL');
    });
  });
});
