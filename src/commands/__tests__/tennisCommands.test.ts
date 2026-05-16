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

import { handleTennisCommand } from '../../commands/tennisCommands';
import { TennisService } from '../../services/TennisService';
import { TennisTrainingLog } from '../../types';

const makeLog = (overrides: Partial<TennisTrainingLog> = {}): TennisTrainingLog => ({
  id: 'tennis-1',
  user_id: 'user-1',
  mission_id: null,
  session_type: 'serve',
  duration_minutes: 60,
  notes: null,
  logged_at: new Date(),
  ...overrides,
});

describe('handleTennisCommand', () => {
  let service: jest.Mocked<TennisService>;

  beforeEach(() => {
    service = {
      startSession: jest.fn(),
      completeSession: jest.fn(),
      getWeeklySummary: jest.fn(),
      getLastSession: jest.fn(),
    } as unknown as jest.Mocked<TennisService>;
  });

  describe('start', () => {
    it('starts a tennis session', async () => {
      service.startSession.mockResolvedValue({ missionId: 'mission-1' });
      const output = await handleTennisCommand(['start', 'serve'], 'user-1', service);
      expect(service.startSession).toHaveBeenCalledWith('user-1', 'serve', null);
      expect(output).toContain('TENNIS SESSION STARTED');
    });

    it('passes eta flag', async () => {
      service.startSession.mockResolvedValue({ missionId: 'mission-1' });
      await handleTennisCommand(['start', 'footwork', '--eta', '45m'], 'user-1', service);
      expect(service.startSession).toHaveBeenCalledWith('user-1', 'footwork', '45m');
    });

    it('rejects invalid session type', async () => {
      const output = await handleTennisCommand(['start', 'swimming'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
      expect(output).toContain('Invalid session type');
    });
  });

  describe('log', () => {
    it('logs a completed tennis session', async () => {
      service.completeSession.mockResolvedValue({
        trainingLog: makeLog(),
        missionId: null,
      });
      const output = await handleTennisCommand(
        ['log', 'serve', '60m'],
        'user-1',
        service
      );
      expect(service.completeSession).toHaveBeenCalledWith('user-1', 'serve', '60m', undefined);
      expect(output).toContain('TENNIS SESSION LOGGED');
    });

    it('returns error when duration missing', async () => {
      const output = await handleTennisCommand(['log', 'serve'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });
  });

  describe('summary', () => {
    it('shows weekly summary with session breakdown', async () => {
      service.getWeeklySummary.mockResolvedValue({
        sessions: [
          { session_type: 'serve', total_minutes: 120, session_count: 2 },
          { session_type: 'footwork', total_minutes: 60, session_count: 1 },
        ],
        totalMinutes: 180,
      });
      const output = await handleTennisCommand(['summary'], 'user-1', service);
      expect(output).toContain('TENNIS WEEKLY SUMMARY');
      expect(output).toContain('serve');
      expect(output).toContain('footwork');
    });

    it('shows empty state when no sessions', async () => {
      service.getWeeklySummary.mockResolvedValue({ sessions: [], totalMinutes: 0 });
      const output = await handleTennisCommand(['summary'], 'user-1', service);
      expect(output).toContain('No sessions this week');
    });
  });
});
