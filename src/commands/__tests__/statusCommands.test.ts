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

import { handleStatusCommand } from '../../commands/statusCommands';
import { BriefingService } from '../../services/BriefingService';
import { GoalService } from '../../services/GoalService';
import { MissionService } from '../../services/MissionService';
import { DisciplineScoreService } from '../../services/DisciplineScoreService';
import { CoachingEngine } from '../../services/CoachingEngine';
import { DisciplineScore, Mission } from '../../types';

const makeDisciplineScore = (overrides: Partial<DisciplineScore> = {}): DisciplineScore => ({
  id: 'ds-1',
  user_id: 'user-1',
  score: 72,
  mission_consistency: 71,
  sleep_consistency: 85,
  focus_duration: 80,
  estimation_accuracy: 65,
  completion_rate: 75,
  wake_consistency: 90,
  habit_adherence: 57,
  goal_adherence: 60,
  distraction_frequency: 80,
  calculated_at: new Date(),
  ...overrides,
});

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  user_id: 'user-1',
  title: 'Write tests',
  habit_category_id: null,
  eta_minutes: 60,
  status: 'active',
  started_at: new Date(Date.now() - 30 * 60_000),
  completed_at: null,
  paused_at: null,
  actual_duration_minutes: null,
  notes: null,
  created_at: new Date(),
  ...overrides,
});

describe('handleStatusCommand', () => {
  let briefingService: jest.Mocked<BriefingService>;
  let goalService: jest.Mocked<GoalService>;
  let missionService: jest.Mocked<MissionService>;
  let disciplineScoreService: jest.Mocked<DisciplineScoreService>;
  let coachingEngine: jest.Mocked<CoachingEngine>;

  beforeEach(() => {
    briefingService = {
      getDailyBriefing: jest.fn(),
    } as unknown as jest.Mocked<BriefingService>;

    goalService = {
      getGoalStatus: jest.fn(),
    } as unknown as jest.Mocked<GoalService>;

    missionService = {
      getActiveMission: jest.fn(),
    } as unknown as jest.Mocked<MissionService>;

    disciplineScoreService = {
      calculateAndSave: jest.fn(),
    } as unknown as jest.Mocked<DisciplineScoreService>;

    coachingEngine = {
      generate: jest.fn(),
      saveInsights: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CoachingEngine>;
  });

  const call = (args: string[]) =>
    handleStatusCommand(
      args,
      'user-1',
      briefingService,
      goalService,
      missionService,
      disciplineScoreService,
      coachingEngine
    );

  describe('briefing', () => {
    it('delegates to briefingService', async () => {
      briefingService.getDailyBriefing.mockResolvedValue('DAILY BRIEFING output');
      const output = await call(['briefing']);
      expect(briefingService.getDailyBriefing).toHaveBeenCalledWith('user-1');
      expect(output).toBe('DAILY BRIEFING output');
    });

    it('defaults to briefing when no subcommand given', async () => {
      briefingService.getDailyBriefing.mockResolvedValue('DAILY BRIEFING output');
      const output = await call([]);
      expect(briefingService.getDailyBriefing).toHaveBeenCalled();
      expect(output).toContain('BRIEFING');
    });
  });

  describe('goals', () => {
    it('shows goal progress with categories', async () => {
      goalService.getGoalStatus.mockResolvedValue([
        {
          goal: { id: 'g-1', status: 'active' } as any,
          totalProgress: 200,
          milestones: [
            { id: 'ms-1', target_value: 500, unit: 'minutes', title: 'Bronze', is_final_exam: false, achieved_at: null } as any,
          ],
          categoryName: 'Exercise',
          habitTypeName: null,
        },
      ]);
      const output = await call(['goals']);
      expect(output).toContain('GOAL STATUS');
      expect(output).toContain('EXERCISE');
    });

    it('shows empty state when no goals', async () => {
      goalService.getGoalStatus.mockResolvedValue([]);
      const output = await call(['goals']);
      expect(output).toContain('No active goals');
    });
  });

  describe('mission', () => {
    it('shows active mission details', async () => {
      missionService.getActiveMission.mockResolvedValue(makeMission());
      const output = await call(['mission']);
      expect(output).toContain('ACTIVE MISSION');
      expect(output).toContain('WRITE TESTS');
    });

    it('shows no mission state', async () => {
      missionService.getActiveMission.mockResolvedValue(null);
      const output = await call(['mission']);
      expect(output).toContain('No active mission');
    });
  });

  describe('score', () => {
    it('shows discipline score breakdown', async () => {
      disciplineScoreService.calculateAndSave.mockResolvedValue(makeDisciplineScore());
      const output = await call(['score']);
      expect(output).toContain('DISCIPLINE SCORE');
      expect(output).toContain('72/100');
    });

    it('returns error when service not available', async () => {
      const output = await handleStatusCommand(
        ['score'],
        'user-1',
        briefingService,
        goalService,
        missionService
        // no disciplineScoreService
      );
      expect(output).toContain('OPERATION FAILED');
    });
  });

  describe('coaching', () => {
    it('generates and saves coaching insights', async () => {
      disciplineScoreService.calculateAndSave.mockResolvedValue(makeDisciplineScore({ completion_rate: 40 }));
      coachingEngine.generate.mockReturnValue([
        { rule: 'completion_rate_critical', message: 'COMPLETION RATE: 40%.', severity: 'critical', category: null },
      ]);
      const output = await call(['coaching']);
      expect(coachingEngine.generate).toHaveBeenCalled();
      expect(coachingEngine.saveInsights).toHaveBeenCalled();
      expect(output).toContain('COACHING INTEL');
      expect(output).toContain('COMPLETION RATE');
    });
  });

  describe('unknown subcommand', () => {
    it('returns usage error', async () => {
      const output = await call(['unknown']);
      expect(output).toContain('OPERATION FAILED');
    });
  });
});
