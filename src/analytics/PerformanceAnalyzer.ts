import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { SleepRepository } from '../repositories/SleepRepository';
import { SubScoreBreakdown } from '../types';
import { analyzeEstimations } from './EstimationAnalyzer';

// Weights must sum to 1.0
const WEIGHTS = {
  missionConsistency: 0.20,
  completionRate:     0.20,
  estimationAccuracy: 0.15,
  sleepConsistency:   0.10,
  focusDuration:      0.10,
  wakeConsistency:    0.05,
  habitAdherence:     0.10,
  goalAdherence:      0.10,
} as const;

export class PerformanceAnalyzer {
  constructor(
    private missionRepo: MissionRepository,
    private habitRepo: HabitRepository,
    private goalRepo: GoalRepository,
    private sleepRepo: SleepRepository
  ) {}

  async analyze(userId: string, days = 7): Promise<SubScoreBreakdown> {
    const [
      allMissions,
      completedMissions,
      sleepLogs,
      habitLogs,
      activeGoals,
      recentProgress,
    ] = await Promise.all([
      this.missionRepo.getRecentAll(userId, days),
      this.missionRepo.getRecentCompleted(userId, days),
      this.sleepRepo.getRecent(userId, days),
      this.habitRepo.getRecentLogs(userId, days),
      this.goalRepo.getAllActive(userId),
      this.goalRepo.getRecentProgressByUser(userId, days),
    ]);

    // mission_consistency — distinct days with ≥1 completed mission
    const completedDays = new Set(
      completedMissions.map(m => new Date(m.completed_at!).toDateString())
    ).size;
    const missionConsistency = Math.round((completedDays / days) * 100);

    // completion_rate — completed / all terminal-status missions
    const terminal = allMissions.filter(m =>
      ['completed', 'failed', 'eta_expired'].includes(m.status)
    );
    const completionRate =
      terminal.length === 0
        ? 100
        : Math.round((completedMissions.length / terminal.length) * 100);

    // estimation_accuracy — from EstimationAnalyzer (0-100)
    const estimation = analyzeEstimations(completedMissions);
    const estimationAccuracy = estimation.sampleCount > 0 ? estimation.avgAccuracyPct : 100;

    // sleep_consistency — distinct days with a sleep log
    const sleepDays = new Set(
      sleepLogs.map(s => new Date(s.logged_at).toDateString())
    ).size;
    const sleepConsistency = Math.round((sleepDays / days) * 100);

    // focus_duration — avg completed mission duration normalised (90 min = 100)
    const durations = completedMissions
      .filter(m => m.actual_duration_minutes != null)
      .map(m => m.actual_duration_minutes!);
    const avgDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const focusDuration = Math.min(100, Math.round((avgDuration / 90) * 100));

    // wake_consistency — penalise stddev in wake-time hours (lower stddev = higher score)
    const wakeHours = sleepLogs
      .filter(s => s.wake_time != null)
      .map(s => {
        const [hh, mm] = String(s.wake_time).split(':').map(Number);
        return hh + mm / 60;
      });
    let wakeConsistency = 100;
    if (wakeHours.length >= 2) {
      const mean = wakeHours.reduce((a, b) => a + b, 0) / wakeHours.length;
      const variance =
        wakeHours.reduce((a, h) => a + Math.pow(h - mean, 2), 0) / wakeHours.length;
      const stddev = Math.sqrt(variance);
      wakeConsistency = Math.max(0, Math.round(100 - stddev * 25));
    }

    // habit_adherence — distinct days with ≥1 habit log
    const habitDays = new Set(
      habitLogs.map(h => new Date(h.logged_at).toDateString())
    ).size;
    const habitAdherence = Math.min(100, Math.round((habitDays / days) * 100));

    // goal_adherence — goals with ≥1 progress log this period / total active goals
    const goalAdherence =
      activeGoals.length === 0
        ? 100
        : Math.round(
            (new Set(recentProgress.map(p => p.goal_id)).size / activeGoals.length) * 100
          );

    // distraction_frequency — 100 minus proportion of failed/expired starts
    const distracted = allMissions.filter(m =>
      ['failed', 'eta_expired'].includes(m.status)
    ).length;
    const distractionFrequency =
      allMissions.length === 0
        ? 100
        : Math.max(0, Math.round(100 - (distracted / allMissions.length) * 100));

    // overall — weighted average (distraction_frequency excluded from weights, stored separately)
    const overall = Math.round(
      WEIGHTS.missionConsistency * missionConsistency +
      WEIGHTS.completionRate     * completionRate     +
      WEIGHTS.estimationAccuracy * estimationAccuracy +
      WEIGHTS.sleepConsistency   * sleepConsistency   +
      WEIGHTS.focusDuration      * focusDuration      +
      WEIGHTS.wakeConsistency    * wakeConsistency    +
      WEIGHTS.habitAdherence     * habitAdherence     +
      WEIGHTS.goalAdherence      * goalAdherence
    );

    return {
      missionConsistency,
      completionRate,
      estimationAccuracy,
      sleepConsistency,
      focusDuration,
      wakeConsistency,
      habitAdherence,
      goalAdherence,
      distractionFrequency,
      overall,
    };
  }
}
