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

import { handleMissionCommand } from '../../commands/missionCommands';
import { MissionService } from '../../services/MissionService';
import { Mission } from '../../types';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  user_id: 'user-1',
  title: 'Write Tests',
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

describe('handleMissionCommand', () => {
  let service: jest.Mocked<MissionService>;

  beforeEach(() => {
    service = {
      start: jest.fn(),
      complete: jest.fn(),
      logRetroactive: jest.fn(),
      abort: jest.fn(),
      extend: jest.fn(),
      getActiveMission: jest.fn(),
      getRecentCompleted: jest.fn(),
    } as unknown as jest.Mocked<MissionService>;
  });

  describe('start', () => {
    it('starts a mission with title', async () => {
      service.start.mockResolvedValue(makeMission());
      const output = await handleMissionCommand(
        ['start', 'Write', 'Tests'],
        'user-1',
        service
      );
      expect(service.start).toHaveBeenCalledWith('user-1', 'Write Tests', null, null);
      expect(output).toContain('MISSION INITIATED');
      expect(output).toContain('Write Tests');
    });

    it('passes eta flag to service', async () => {
      service.start.mockResolvedValue(makeMission());
      await handleMissionCommand(['start', 'Tennis', '--eta', '90m'], 'user-1', service);
      expect(service.start).toHaveBeenCalledWith('user-1', 'Tennis', '90m', null);
    });

    it('passes category flag to service', async () => {
      service.start.mockResolvedValue(makeMission({ habit_category_id: 'cat-1' }));
      await handleMissionCommand(
        ['start', 'Tennis', '--category', 'exercise'],
        'user-1',
        service
      );
      expect(service.start).toHaveBeenCalledWith('user-1', 'Tennis', null, 'exercise');
    });

    it('returns error when title is empty', async () => {
      const output = await handleMissionCommand(['start'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
      expect(service.start).not.toHaveBeenCalled();
    });

    it('returns error when service throws', async () => {
      service.start.mockRejectedValue(new Error('Active mission already running'));
      const output = await handleMissionCommand(['start', 'Test'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
      expect(output).toContain('Active mission already running');
    });
  });

  describe('complete', () => {
    it('completes with no goal progress', async () => {
      const mission = makeMission({ status: 'completed', actual_duration_minutes: 45 });
      service.complete.mockResolvedValue({ mission, goalProgress: null });
      const output = await handleMissionCommand(['complete'], 'user-1', service);
      expect(output).toContain('MISSION COMPLETE');
    });

    it('shows milestone unlocked in output', async () => {
      const mission = makeMission({ status: 'completed', actual_duration_minutes: 90 });
      service.complete.mockResolvedValue({
        mission,
        goalProgress: {
          goal: {} as any,
          progressLog: { value_delta: 90 } as any,
          totalProgress: 600,
          milestonesUnlocked: [
            {
              id: 'ms-1',
              goal_id: 'goal-1',
              title: 'Beginner',
              target_value: 600,
              unit: 'minutes',
              is_final_exam: false,
              achieved_at: new Date(),
              created_at: new Date(),
            },
          ],
          goalCompleted: false,
        },
      });
      const output = await handleMissionCommand(['complete'], 'user-1', service);
      expect(output).toContain('MILESTONE UNLOCKED');
      expect(output).toContain('Beginner');
    });
  });

  describe('log', () => {
    it('logs an activity retroactively', async () => {
      service.logRetroactive.mockResolvedValue({
        mission: makeMission({ mode: 'retroactive', status: 'completed', actual_duration_minutes: 45 }),
        goalProgress: null,
        habitGoalProgress: null,
      });
      const output = await handleMissionCommand(
        ['log', 'exercise', 'running', '45m'],
        'user-1',
        service
      );
      expect(service.logRetroactive).toHaveBeenCalledWith(
        'user-1',
        'exercise',
        'running',
        '45m',
        null
      );
      expect(output).toContain('ACTIVITY LOGGED');
    });

    it('shows goal progress when available', async () => {
      service.logRetroactive.mockResolvedValue({
        mission: makeMission({ mode: 'retroactive', status: 'completed', actual_duration_minutes: 45 }),
        goalProgress: {
          goal: {} as any,
          progressLog: { value_delta: 45 } as any,
          totalProgress: 145,
          milestonesUnlocked: [],
          goalCompleted: false,
        },
        habitGoalProgress: null,
      });
      const output = await handleMissionCommand(
        ['log', 'exercise', 'running', '45m'],
        'user-1',
        service
      );
      expect(output).toContain('+45min');
      expect(output).toContain('total 145min');
    });

    it('returns error when args missing', async () => {
      const output = await handleMissionCommand(['log', 'exercise'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
      expect(service.logRetroactive).not.toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('aborts the mission', async () => {
      service.abort.mockResolvedValue(makeMission({ status: 'failed' }));
      const output = await handleMissionCommand(['abort'], 'user-1', service);
      expect(output).toContain('MISSION ABORTED');
    });
  });

  describe('status', () => {
    it('shows active mission info', async () => {
      service.getActiveMission.mockResolvedValue(makeMission({ eta_minutes: 60 }));
      const output = await handleMissionCommand(['status'], 'user-1', service);
      expect(output).toContain('ACTIVE MISSION');
      expect(output).toContain('Write Tests');
    });

    it('shows no mission message when none active', async () => {
      service.getActiveMission.mockResolvedValue(null);
      const output = await handleMissionCommand(['status'], 'user-1', service);
      expect(output).toContain('No active mission');
    });
  });

  describe('extend', () => {
    it('extends the ETA', async () => {
      service.extend.mockResolvedValue(makeMission({ eta_minutes: 90 }));
      const output = await handleMissionCommand(['extend', '30m'], 'user-1', service);
      expect(service.extend).toHaveBeenCalledWith('user-1', '30m');
      expect(output).toContain('ETA EXTENDED');
    });

    it('returns error when no duration given', async () => {
      const output = await handleMissionCommand(['extend'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });
  });

  describe('unknown subcommand', () => {
    it('returns error for unknown subcommand', async () => {
      const output = await handleMissionCommand(['unknown'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });
  });
});
