import { MissionService } from './MissionService';
import { SleepService } from './SleepService';
import { GoalService } from './GoalService';
import { TennisService } from './TennisService';
import { DisciplineScoreService } from './DisciplineScoreService';
import { CoachingEngine } from './CoachingEngine';
import { formatBlock } from '../utils/formatter';

export class BriefingService {
  constructor(
    private missionService: MissionService,
    private sleepService: SleepService,
    private goalService: GoalService,
    private tennisService: TennisService,
    private disciplineScoreService: DisciplineScoreService,
    private coachingEngine: CoachingEngine
  ) {}

  async getDailyBriefing(userId: string): Promise<string> {
    const [activeMission, sleepStatus, goalStatuses, tennisSummary, disciplineScore] =
      await Promise.all([
        this.missionService.getActiveMission(userId),
        this.sleepService.getStatus(userId),
        this.goalService.getGoalStatus(userId),
        this.tennisService.getWeeklySummary(userId),
        this.disciplineScoreService.calculateAndSave(userId),
      ]);

    const sections: { label: string; lines: string[] }[] = [];

    // Sleep Intel
    const sleepLines: string[] = [];
    if (sleepStatus.lastLog) {
      const h = Math.floor(sleepStatus.lastLog.duration_minutes / 60);
      const m = sleepStatus.lastLog.duration_minutes % 60;
      sleepLines.push(`Last: ${h}h ${m}m | Quality: ${sleepStatus.lastLog.sleep_quality ?? 'N/A'}`);
    } else {
      sleepLines.push('No sleep logged');
    }
    // averageQuality is on 1-4 scale
    sleepLines.push(`Debt: ${sleepStatus.debtMinutes}min | Avg quality score: ${sleepStatus.averageQuality}/4`);
    const readiness = this.sleepService.getReadinessLabel(
      sleepStatus.debtMinutes,
      sleepStatus.averageQuality
    );
    sleepLines.push(`Readiness: ${readiness}`);
    sections.push({ label: 'SLEEP INTEL', lines: sleepLines });

    // Active Mission
    const missionLines: string[] = [];
    if (activeMission) {
      const elapsed = activeMission.started_at
        ? Math.round((Date.now() - new Date(activeMission.started_at).getTime()) / 60000)
        : 0;
      missionLines.push(`ACTIVE: ${activeMission.title}`);
      missionLines.push(`Elapsed: ${elapsed}min | ETA: ${activeMission.eta_minutes ?? '—'}min`);
    } else {
      missionLines.push('No active mission');
    }
    sections.push({ label: 'CURRENT MISSION', lines: missionLines });

    // Goal Progress
    if (goalStatuses.length > 0) {
      const goalLines = goalStatuses.map(g => {
        const nextMilestone = g.milestones.find(m => !m.achieved_at);
        const bar =
          nextMilestone
            ? `${g.totalProgress}/${nextMilestone.target_value} ${nextMilestone.unit}`
            : `${g.totalProgress} (all milestones achieved)`;
        return `${g.categoryName}: ${bar}`;
      });
      sections.push({ label: 'GOAL PROGRESS', lines: goalLines });
    }

    // Tennis
    if (tennisSummary.totalMinutes > 0) {
      const tennisLines = [`Weekly total: ${tennisSummary.totalMinutes}min`];
      for (const s of tennisSummary.sessions) {
        tennisLines.push(`  ${s.session_type}: ${s.total_minutes}min (${s.session_count} sessions)`);
      }
      sections.push({ label: 'TENNIS', lines: tennisLines });
    }

    // Discipline Score
    const insights = this.coachingEngine.generate(disciplineScore);
    sections.push({
      label: 'DISCIPLINE SCORE',
      lines: [
        `Score: ${disciplineScore.score}/100`,
        ...insights.map(ins => `► ${ins.message}`),
      ],
    });

    return formatBlock('DAILY BRIEFING', sections);
  }
}
