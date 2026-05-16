import { MissionService } from './MissionService';
import { SleepService } from './SleepService';
import { GoalService } from './GoalService';
import { DisciplineScoreService } from './DisciplineScoreService';
import { CoachingEngine } from './CoachingEngine';
import { formatBlock } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';

export class DebriefService {
  constructor(
    private missionService: MissionService,
    private sleepService: SleepService,
    private goalService: GoalService,
    private disciplineScoreService: DisciplineScoreService,
    private coachingEngine: CoachingEngine
  ) {}

  async getDebrief(userId: string): Promise<string> {
    const [recentMissions, sleepStatus, goalStatuses, disciplineScore] = await Promise.all([
      this.missionService.getRecentCompleted(userId),
      this.sleepService.getStatus(userId),
      this.goalService.getGoalStatus(userId),
      this.disciplineScoreService.calculateAndSave(userId),
    ]);

    const sections: { label: string; lines: string[] }[] = [];

    // ── Missions today ───────────────────────────────────────────────────
    if (recentMissions.length > 0) {
      const missionLines = recentMissions.map(m => {
        const dur = m.actual_duration_minutes ? formatMinutes(m.actual_duration_minutes) : '—';
        return `${m.status.toUpperCase()}: ${m.title} (${dur})`;
      });
      sections.push({ label: 'MISSIONS TODAY', lines: missionLines });
    } else {
      sections.push({ label: 'MISSIONS TODAY', lines: ['No missions completed today.'] });
    }

    // ── Sleep ────────────────────────────────────────────────────────────
    const sleepLines: string[] = [];
    if (sleepStatus.lastLog) {
      const h = Math.floor(sleepStatus.lastLog.duration_minutes / 60);
      const m = sleepStatus.lastLog.duration_minutes % 60;
      sleepLines.push(`Last: ${h}h ${m}m | Quality: ${sleepStatus.lastLog.sleep_quality ?? 'N/A'}`);
    } else {
      sleepLines.push('Not logged tonight — log before sleeping.');
    }
    const readiness = this.sleepService.getReadinessLabel(
      sleepStatus.debtMinutes,
      sleepStatus.averageQuality
    );
    sleepLines.push(`Readiness: ${readiness} | Debt: ${sleepStatus.debtMinutes}min`);
    sections.push({ label: 'SLEEP', lines: sleepLines });

    // ── Discipline score ─────────────────────────────────────────────────
    const scoreLines = [
      `Score: ${disciplineScore.score}/100`,
      `Mission consistency: ${disciplineScore.mission_consistency ?? '—'}%`,
      `Completion rate:     ${disciplineScore.completion_rate ?? '—'}%`,
      `Estimation accuracy: ${disciplineScore.estimation_accuracy ?? '—'}%`,
      `Habit adherence:     ${disciplineScore.habit_adherence ?? '—'}%`,
    ];
    sections.push({ label: 'DISCIPLINE SCORE', lines: scoreLines });

    // ── Goals ────────────────────────────────────────────────────────────
    if (goalStatuses.length > 0) {
      const goalLines = goalStatuses.map(g => {
        const nextMilestone = g.milestones.find(ms => !ms.achieved_at);
        const bar = nextMilestone
          ? `${formatMinutes(g.totalProgress)} / ${formatMinutes(nextMilestone.target_value)} ${nextMilestone.is_final_exam ? '[FINAL EXAM]' : ''}`
          : `${formatMinutes(g.totalProgress)} (all milestones achieved)`;
        return `${g.categoryName}: ${bar}`;
      });
      sections.push({ label: 'GOAL PROGRESS', lines: goalLines });
    }

    // ── Coaching intel ───────────────────────────────────────────────────
    const insights = this.coachingEngine.generate(disciplineScore);
    const coachingLines = insights.map((ins, i) => `[${i + 1}] ${ins.message}`);
    sections.push({ label: 'COACHING INTEL', lines: coachingLines });

    return formatBlock('EVENING DEBRIEF', sections);
  }
}
