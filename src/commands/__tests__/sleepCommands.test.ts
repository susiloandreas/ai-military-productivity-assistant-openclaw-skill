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

import { handleSleepCommand } from '../../commands/sleepCommands';
import { SleepService } from '../../services/SleepService';
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

describe('handleSleepCommand', () => {
  let service: jest.Mocked<SleepService>;

  beforeEach(() => {
    service = {
      log: jest.fn(),
      getStatus: jest.fn(),
      getReadinessLabel: jest.fn().mockReturnValue('OPTIMAL'),
    } as unknown as jest.Mocked<SleepService>;
  });

  describe('log', () => {
    it('logs sleep with duration only', async () => {
      service.log.mockResolvedValue({
        log: makeSleepLog(),
        debtMinutes: 0,
        averageQuality: 3.2,
      });
      const output = await handleSleepCommand(['log', '8h'], 'user-1', service);
      expect(service.log).toHaveBeenCalledWith('user-1', 480, null, null, undefined);
      expect(output).toContain('SLEEP LOGGED');
      expect(output).toContain('8h');
    });

    it('parses quality flag', async () => {
      service.log.mockResolvedValue({
        log: makeSleepLog({ sleep_quality: 'excellent' }),
        debtMinutes: 0,
        averageQuality: 4,
      });
      await handleSleepCommand(['log', '7h', '--quality', 'excellent'], 'user-1', service);
      expect(service.log).toHaveBeenCalledWith(
        'user-1',
        420,
        null,
        'excellent',
        undefined
      );
    });

    it('parses wake time flag', async () => {
      service.log.mockResolvedValue({
        log: makeSleepLog(),
        debtMinutes: 0,
        averageQuality: 3,
      });
      await handleSleepCommand(
        ['log', '7h30m', '--wake', '06:30'],
        'user-1',
        service
      );
      const callArgs = service.log.mock.calls[0];
      expect(callArgs[1]).toBe(450); // 7h30m
      expect(callArgs[2]).toBeInstanceOf(Date);
    });

    it('returns error for invalid quality', async () => {
      const output = await handleSleepCommand(
        ['log', '7h', '--quality', 'perfect'],
        'user-1',
        service
      );
      expect(output).toContain('OPERATION FAILED');
      expect(output).toContain('Invalid quality');
    });

    it('returns error when no duration given', async () => {
      const output = await handleSleepCommand(['log'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });

    it('shows readiness in output', async () => {
      service.log.mockResolvedValue({
        log: makeSleepLog(),
        debtMinutes: 30,
        averageQuality: 2.5,
      });
      service.getReadinessLabel.mockReturnValue('ADEQUATE');
      const output = await handleSleepCommand(['log', '6h'], 'user-1', service);
      expect(output).toContain('ADEQUATE');
    });
  });

  describe('status', () => {
    it('shows sleep status', async () => {
      service.getStatus.mockResolvedValue({
        lastLog: makeSleepLog(),
        debtMinutes: 30,
        averageQuality: 3,
        recentLogs: [],
      });
      const output = await handleSleepCommand(['status'], 'user-1', service);
      expect(output).toContain('SLEEP STATUS');
    });

    it('shows not-logged state when no data', async () => {
      service.getStatus.mockResolvedValue({
        lastLog: null,
        debtMinutes: 0,
        averageQuality: 0,
        recentLogs: [],
      });
      const output = await handleSleepCommand(['status'], 'user-1', service);
      expect(output).toContain('Not logged');
    });
  });
});
