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

import { BriefingService } from '../../services/BriefingService';
import { MissionService } from '../../services/MissionService';
import { SleepService } from '../../services/SleepService';
import { GoalService } from '../../services/GoalService';
import { TennisService } from '../../services/TennisService';
import { DisciplineScoreService } from '../../services/DisciplineScoreService';
import { CoachingEngine } from '../../services/CoachingEngine';
import { DisciplineScore } from '../../types';

const makeScore = (): DisciplineScore => ({
  id: 'ds-1',
  user_id: 'user-1',
  score: 72,
  mission_consistency: 70,
  sleep_consistency: 85,
  focus_duration: 75,
  estimation_accuracy: 80,
  completion_rate: 80,
  wake_consistency: 90,
  habit_adherence: 60,
  goal_adherence: 65,
  distraction_frequency: 80,
  calculated_at: new Date(),
});

describe('BriefingService', () => {
  let missionService: jest.Mocked<MissionService>;
  let sleepService: jest.Mocked<SleepService>;
  let goalService: jest.Mocked<GoalService>;
  let tennisService: jest.Mocked<TennisService>;
  let disciplineScoreService: jest.Mocked<DisciplineScoreService>;
  let coachingEngine: jest.Mocked<CoachingEngine>;
  let service: BriefingService;

  beforeEach(() => {
    missionService = {
      getActiveMission: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<MissionService>;

    sleepService = {
      getStatus: jest.fn().mockResolvedValue({
        lastLog: null,
        debtMinutes: 0,
        averageQuality: 0,
        recentLogs: [],
      }),
      getReadinessLabel: jest.fn().mockReturnValue('ADEQUATE'),
    } as unknown as jest.Mocked<SleepService>;

    goalService = {
      getGoalStatus: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<GoalService>;

    tennisService = {
      getWeeklySummary: jest.fn().mockResolvedValue({ sessions: [], totalMinutes: 0 }),
    } as unknown as jest.Mocked<TennisService>;

    disciplineScoreService = {
      calculateAndSave: jest.fn().mockResolvedValue(makeScore()),
    } as unknown as jest.Mocked<DisciplineScoreService>;

    coachingEngine = {
      generate: jest.fn().mockReturnValue([
        { rule: 'score_optimal', message: 'DISCIPLINE SCORE: 72/100 — OPTIMAL.', severity: 'info', category: null },
      ]),
    } as unknown as jest.Mocked<CoachingEngine>;

    service = new BriefingService(
      missionService, sleepService, goalService, tennisService,
      disciplineScoreService, coachingEngine
    );
  });

  it('returns a DAILY BRIEFING block', async () => {
    const output = await service.getDailyBriefing('user-1');
    expect(output).toContain('DAILY BRIEFING');
    expect(output).toContain('SLEEP INTEL');
    expect(output).toContain('CURRENT MISSION');
    expect(output).toContain('DISCIPLINE SCORE');
  });

  it('shows sleep details when log exists', async () => {
    sleepService.getStatus.mockResolvedValue({
      lastLog: {
        id: 'sl-1', user_id: 'user-1', duration_minutes: 450, wake_time: '06:00:00',
        sleep_quality: 'good', notes: null, logged_at: new Date(),
      },
      debtMinutes: 30,
      averageQuality: 3,
      recentLogs: [],
    });
    const output = await service.getDailyBriefing('user-1');
    expect(output).toContain('7h 30m');
    expect(output).toContain('good');
  });

  it('shows active mission when one exists', async () => {
    missionService.getActiveMission.mockResolvedValue({
      id: 'mission-1', user_id: 'user-1', title: 'Write Code',
      habit_category_id: null, habit_type_id: null, eta_minutes: 60, mode: 'live', status: 'active',
      started_at: new Date(Date.now() - 30 * 60_000),
      completed_at: null, paused_at: null, actual_duration_minutes: null,
      notes: null, created_at: new Date(),
    });
    const output = await service.getDailyBriefing('user-1');
    expect(output).toContain('ACTIVE: Write Code');
  });

  it('includes tennis section when sessions exist', async () => {
    tennisService.getWeeklySummary.mockResolvedValue({
      sessions: [{ session_type: 'serve', total_minutes: 60, session_count: 1 } as any],
      totalMinutes: 60,
    });
    const output = await service.getDailyBriefing('user-1');
    expect(output).toContain('TENNIS');
    expect(output).toContain('serve');
  });

  it('includes coaching insight in discipline section', async () => {
    const output = await service.getDailyBriefing('user-1');
    expect(output).toContain('OPTIMAL');
  });
});
