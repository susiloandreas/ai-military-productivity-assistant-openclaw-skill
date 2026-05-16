import { DisciplineScore, CoachingInsight } from '../types';
import { CoachingRepository } from '../repositories/CoachingRepository';

export class CoachingEngine {
  constructor(private coachingRepo: CoachingRepository) {}

  /** Generate up to 3 prioritised insights from a discipline score. */
  generate(score: DisciplineScore, categoryFilter?: string): CoachingInsight[] {
    const insights: CoachingInsight[] = [];

    if (score.completion_rate !== null && score.completion_rate < 50) {
      insights.push({
        rule: 'completion_rate_critical',
        message: `COMPLETION RATE: ${score.completion_rate}%. CRITICAL. Stop starting missions you do not finish. Focus first, execute second.`,
        severity: 'critical',
        category: null,
      });
    }

    if (score.estimation_accuracy !== null && score.estimation_accuracy < 60) {
      insights.push({
        rule: 'eta_accuracy_low',
        message: `ETA ACCURACY: ${score.estimation_accuracy}%. Calibrate your estimates. Add a 30% buffer until accuracy exceeds 75%.`,
        severity: 'warning',
        category: null,
      });
    }

    if (score.mission_consistency !== null && score.mission_consistency < 50) {
      insights.push({
        rule: 'mission_consistency_low',
        message: `MISSION CONSISTENCY: ${score.mission_consistency}%. Less than half the week had active missions. Operational tempo is slipping.`,
        severity: 'warning',
        category: null,
      });
    }

    if (score.habit_adherence !== null && score.habit_adherence < 50) {
      insights.push({
        rule: 'habit_adherence_low',
        message: `HABIT ADHERENCE: ${score.habit_adherence}%. Daily reps build compound advantage. Missed reps compound deficit.`,
        severity: 'warning',
        category: null,
      });
    }

    if (score.sleep_consistency !== null && score.sleep_consistency < 50) {
      insights.push({
        rule: 'sleep_logging_gap',
        message: `SLEEP LOG GAP: ${score.sleep_consistency}% coverage. Log sleep every night — you cannot manage what you do not measure.`,
        severity: 'info',
        category: null,
      });
    }

    if (score.wake_consistency !== null && score.wake_consistency < 60) {
      insights.push({
        rule: 'wake_inconsistent',
        message: `WAKE INCONSISTENCY detected. Variable wake times degrade sleep quality and cognitive performance.`,
        severity: 'info',
        category: null,
      });
    }

    // Positive reinforcement when no critical issues and score is high
    if (insights.filter(i => i.severity === 'critical').length === 0 && score.score >= 75) {
      insights.push({
        rule: 'score_optimal',
        message: `DISCIPLINE SCORE: ${score.score}/100 — OPTIMAL. Maintain tempo. Raise the bar.`,
        severity: 'info',
        category: null,
      });
    } else if (insights.length === 0) {
      insights.push({
        rule: 'score_adequate',
        message: `DISCIPLINE SCORE: ${score.score}/100 — ADEQUATE. Identify your weakest sub-score and target it this week.`,
        severity: 'info',
        category: null,
      });
    }

    const filtered = categoryFilter
      ? insights.filter(i => i.category === null || i.category === categoryFilter)
      : insights;

    return filtered.slice(0, 3);
  }

  async saveInsights(userId: string, insights: CoachingInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.coachingRepo.save(userId, insight);
    }
  }
}
