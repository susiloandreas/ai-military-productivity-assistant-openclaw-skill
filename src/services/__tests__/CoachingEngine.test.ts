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

import { CoachingEngine } from '../../services/CoachingEngine';
import { CoachingRepository } from '../../repositories/CoachingRepository';
import { DisciplineScore } from '../../types';

const makeScore = (overrides: Partial<DisciplineScore> = {}): DisciplineScore => ({
  id: 'ds-1',
  user_id: 'user-1',
  score: 78,
  mission_consistency: 80,
  sleep_consistency: 85,
  focus_duration: 75,
  estimation_accuracy: 80,
  completion_rate: 80,
  wake_consistency: 90,
  habit_adherence: 70,
  goal_adherence: 75,
  distraction_frequency: 85,
  calculated_at: new Date(),
  ...overrides,
});

describe('CoachingEngine', () => {
  let coachingRepo: jest.Mocked<CoachingRepository>;
  let engine: CoachingEngine;

  beforeEach(() => {
    coachingRepo = {
      save: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<CoachingRepository>;
    engine = new CoachingEngine(coachingRepo);
  });

  describe('generate', () => {
    it('returns OPTIMAL insight when score >= 75 and no critical issues', () => {
      const insights = engine.generate(makeScore({ score: 80 }));
      expect(insights.length).toBeGreaterThan(0);
      expect(insights.some(i => i.rule === 'score_optimal')).toBe(true);
    });

    it('returns critical insight for very low completion rate', () => {
      const insights = engine.generate(makeScore({ completion_rate: 40 }));
      const critical = insights.find(i => i.rule === 'completion_rate_critical');
      expect(critical).toBeDefined();
      expect(critical?.severity).toBe('critical');
      expect(critical?.message).toContain('40%');
    });

    it('returns warning for low ETA accuracy', () => {
      const insights = engine.generate(makeScore({ score: 55, estimation_accuracy: 50 }));
      const warning = insights.find(i => i.rule === 'eta_accuracy_low');
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('warning');
    });

    it('returns warning for low mission consistency', () => {
      const insights = engine.generate(makeScore({ score: 50, mission_consistency: 30 }));
      expect(insights.some(i => i.rule === 'mission_consistency_low')).toBe(true);
    });

    it('returns warning for low habit adherence', () => {
      const insights = engine.generate(makeScore({ score: 50, habit_adherence: 30 }));
      expect(insights.some(i => i.rule === 'habit_adherence_low')).toBe(true);
    });

    it('caps output at 3 insights', () => {
      const worstScore = makeScore({
        score: 20,
        completion_rate: 30,
        estimation_accuracy: 40,
        mission_consistency: 20,
        habit_adherence: 20,
        sleep_consistency: 20,
        wake_consistency: 30,
      });
      const insights = engine.generate(worstScore);
      expect(insights.length).toBeLessThanOrEqual(3);
    });

    it('filters by category when provided', () => {
      const insights = engine.generate(makeScore(), 'tennis');
      // All category-specific insights have category=null (no tennis-specific rules yet)
      // Result should still be non-empty from the general score insight
      expect(insights.length).toBeGreaterThan(0);
    });
  });

  describe('saveInsights', () => {
    it('saves each insight to the repository', async () => {
      const insights = engine.generate(makeScore({ score: 80 }));
      await engine.saveInsights('user-1', insights);
      expect(coachingRepo.save).toHaveBeenCalledTimes(insights.length);
    });
  });
});
