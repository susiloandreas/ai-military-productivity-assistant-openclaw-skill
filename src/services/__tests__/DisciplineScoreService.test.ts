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

import { DisciplineScoreService } from '../../services/DisciplineScoreService';
import { DisciplineRepository } from '../../repositories/DisciplineRepository';
import { PerformanceAnalyzer } from '../../analytics/PerformanceAnalyzer';
import { DisciplineScore, SubScoreBreakdown } from '../../types';

const makeBreakdown = (): SubScoreBreakdown => ({
  missionConsistency: 80,
  completionRate: 75,
  estimationAccuracy: 70,
  sleepConsistency: 85,
  focusDuration: 60,
  wakeConsistency: 90,
  habitAdherence: 65,
  goalAdherence: 70,
  distractionFrequency: 80,
  overall: 75,
});

const makeScore = (): DisciplineScore => ({
  id: 'ds-1',
  user_id: 'user-1',
  score: 75,
  mission_consistency: 80,
  sleep_consistency: 85,
  focus_duration: 60,
  estimation_accuracy: 70,
  completion_rate: 75,
  wake_consistency: 90,
  habit_adherence: 65,
  goal_adherence: 70,
  distraction_frequency: 80,
  calculated_at: new Date(),
});

describe('DisciplineScoreService', () => {
  let disciplineRepo: jest.Mocked<DisciplineRepository>;
  let analyzer: jest.Mocked<PerformanceAnalyzer>;
  let service: DisciplineScoreService;

  beforeEach(() => {
    disciplineRepo = {
      saveScore: jest.fn(),
      getLatestScore: jest.fn(),
      getScoreHistory: jest.fn(),
      getAverageScore: jest.fn(),
    } as unknown as jest.Mocked<DisciplineRepository>;

    analyzer = {
      analyze: jest.fn(),
    } as unknown as jest.Mocked<PerformanceAnalyzer>;

    service = new DisciplineScoreService(disciplineRepo, analyzer);
  });

  describe('calculateAndSave', () => {
    it('calls analyzer and saves score with correct field mapping', async () => {
      analyzer.analyze.mockResolvedValue(makeBreakdown());
      disciplineRepo.saveScore.mockResolvedValue(makeScore());

      const result = await service.calculateAndSave('user-1');
      expect(analyzer.analyze).toHaveBeenCalledWith('user-1');
      expect(disciplineRepo.saveScore).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          score: 75,
          mission_consistency: 80,
          sleep_consistency: 85,
          estimation_accuracy: 70,
        })
      );
      expect(result.score).toBe(75);
    });
  });

  describe('getLatest', () => {
    it('delegates to repository', async () => {
      disciplineRepo.getLatestScore.mockResolvedValue(makeScore());
      const result = await service.getLatest('user-1');
      expect(disciplineRepo.getLatestScore).toHaveBeenCalledWith('user-1');
      expect(result?.score).toBe(75);
    });

    it('returns null when no score exists', async () => {
      disciplineRepo.getLatestScore.mockResolvedValue(null);
      const result = await service.getLatest('user-1');
      expect(result).toBeNull();
    });
  });

  describe('getWeeklyAverage', () => {
    it('delegates to repository with 7 days', async () => {
      disciplineRepo.getAverageScore.mockResolvedValue(68.5);
      const result = await service.getWeeklyAverage('user-1');
      expect(disciplineRepo.getAverageScore).toHaveBeenCalledWith('user-1', 7);
      expect(result).toBe(68.5);
    });
  });
});
