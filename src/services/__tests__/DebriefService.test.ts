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

import { DebriefService } from '../../services/DebriefService';
import { MissionService } from '../../services/MissionService';
import { SleepService } from '../../services/SleepService';
import { GoalService } from '../../services/GoalService';
import { DisciplineScoreService } from '../../services/DisciplineScoreService';
import { CoachingEngine } from '../../services/CoachingEngine';
import { DisciplineScore, Mission } from '../../types';

const makeScore = (): DisciplineScore => ({
  id: 'ds-1', user_id: 'user-1', score: 65,
  mission_consistency: 70, sleep_consistency: 80, focus_duration: 60,
  estimation_accuracy: 55, completion_rate: 60, wake_consistency: 85,
  habit_adherence: 50, goal_adherence: 60, distraction_frequency: 75,
  calculated_at: new Date(),
});

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1', user_id: 'user-1', title: 'Write report',
  habit_category_id: null, habit_type_id: null, eta_minutes: 60, mode: 'live', status: 'completed',
  started_at: new Date(), completed_at: new Date(), paused_at: null,
  actual_duration_minutes: 55, notes: null, created_at: new Date(),
  ...overrides,
});

describe('DebriefService', () => {
  let missionService: jest.Mocked<MissionService>;
  let sleepService: jest.Mocked<SleepService>;
  let goalService: jest.Mocked<GoalService>;
  let disciplineScoreService: jest.Mocked<DisciplineScoreService>;
  let coachingEngine: jest.Mocked<CoachingEngine>;
  let service: DebriefService;

  beforeEach(() => {
    missionService = {
      getRecentCompleted: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MissionService>;

    sleepService = {
      getStatus: jest.fn().mockResolvedValue({
        lastLog: null, debtMinutes: 0, averageQuality: 0, recentLogs: [],
      }),
      getReadinessLabel: jest.fn().mockReturnValue('ADEQUATE'),
    } as unknown as jest.Mocked<SleepService>;

    goalService = {
      getGoalStatus: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<GoalService>;

    disciplineScoreService = {
      calculateAndSave: jest.fn().mockResolvedValue(makeScore()),
    } as unknown as jest.Mocked<DisciplineScoreService>;

    coachingEngine = {
      generate: jest.fn().mockReturnValue([
        { rule: 'eta_accuracy_low', message: 'ETA ACCURACY: 55%.', severity: 'warning', category: null },
      ]),
    } as unknown as jest.Mocked<CoachingEngine>;

    service = new DebriefService(
      missionService, sleepService, goalService, disciplineScoreService, coachingEngine
    );
  });

  it('returns an EVENING DEBRIEF block', async () => {
    const output = await service.getDebrief('user-1');
    expect(output).toContain('EVENING DEBRIEF');
    expect(output).toContain('MISSIONS TODAY');
    expect(output).toContain('SLEEP');
    expect(output).toContain('DISCIPLINE SCORE');
    expect(output).toContain('COACHING INTEL');
  });

  it('shows completed mission in today section', async () => {
    missionService.getRecentCompleted.mockResolvedValue([makeMission()]);
    const output = await service.getDebrief('user-1');
    expect(output).toContain('COMPLETED: Write report');
    expect(output).toContain('55m');
  });

  it('shows no missions message when none completed', async () => {
    const output = await service.getDebrief('user-1');
    expect(output).toContain('No missions completed today');
  });

  it('shows sleep details when logged', async () => {
    sleepService.getStatus.mockResolvedValue({
      lastLog: {
        id: 'sl-1', user_id: 'user-1', duration_minutes: 480,
        wake_time: '06:00:00', sleep_quality: 'excellent',
        notes: null, logged_at: new Date(),
      },
      debtMinutes: 0, averageQuality: 4, recentLogs: [],
    });
    const output = await service.getDebrief('user-1');
    expect(output).toContain('8h 0m');
    expect(output).toContain('excellent');
  });

  it('shows discipline sub-scores', async () => {
    const output = await service.getDebrief('user-1');
    expect(output).toContain('65/100');
    expect(output).toContain('70%'); // mission consistency
  });

  it('shows coaching insights', async () => {
    const output = await service.getDebrief('user-1');
    expect(output).toContain('ETA ACCURACY');
  });

  it('shows goal progress when goals exist', async () => {
    goalService.getGoalStatus.mockResolvedValue([
      {
        goal: { id: 'g-1', status: 'active' } as any,
        totalProgress: 200,
        milestones: [
          { id: 'ms-1', target_value: 500, unit: 'minutes', title: 'Bronze', is_final_exam: false, achieved_at: null } as any,
        ],
        categoryName: 'exercise',
        habitTypeName: null,
      },
    ]);
    const output = await service.getDebrief('user-1');
    expect(output).toContain('GOAL PROGRESS');
    expect(output).toContain('exercise');
  });
});
