import { DisciplineRepository } from '../repositories/DisciplineRepository';
import { PerformanceAnalyzer } from '../analytics/PerformanceAnalyzer';
import { DisciplineScore } from '../types';

export class DisciplineScoreService {
  constructor(
    private disciplineRepo: DisciplineRepository,
    private analyzer: PerformanceAnalyzer
  ) {}

  async calculateAndSave(userId: string): Promise<DisciplineScore> {
    const breakdown = await this.analyzer.analyze(userId);

    return this.disciplineRepo.saveScore(userId, {
      score:                breakdown.overall,
      mission_consistency:  breakdown.missionConsistency,
      sleep_consistency:    breakdown.sleepConsistency,
      focus_duration:       breakdown.focusDuration,
      estimation_accuracy:  breakdown.estimationAccuracy,
      completion_rate:      breakdown.completionRate,
      wake_consistency:     breakdown.wakeConsistency,
      habit_adherence:      breakdown.habitAdherence,
      goal_adherence:       breakdown.goalAdherence,
      distraction_frequency: breakdown.distractionFrequency,
    });
  }

  async getLatest(userId: string): Promise<DisciplineScore | null> {
    return this.disciplineRepo.getLatestScore(userId);
  }

  async getHistory(userId: string, days = 30): Promise<DisciplineScore[]> {
    return this.disciplineRepo.getScoreHistory(userId, days);
  }

  async getWeeklyAverage(userId: string): Promise<number> {
    return this.disciplineRepo.getAverageScore(userId, 7);
  }
}
