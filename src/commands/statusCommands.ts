import { BriefingService } from '../services/BriefingService';
import { GoalService } from '../services/GoalService';
import { MissionService } from '../services/MissionService';
import { DisciplineScoreService } from '../services/DisciplineScoreService';
import { CoachingEngine } from '../services/CoachingEngine';
import { formatError, formatBlock, formatStatus } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';

/**
 * /status briefing    — daily briefing (sleep + mission + goals + tennis + discipline score)
 * /status goals       — all active goal progress
 * /status mission     — active mission (alias)
 * /status score       — current discipline score breakdown
 * /status coaching    — targeted coaching insights
 */
export async function handleStatusCommand(
  args: string[],
  userId: string,
  briefingService: BriefingService,
  goalService: GoalService,
  missionService: MissionService,
  disciplineScoreService?: DisciplineScoreService,
  coachingEngine?: CoachingEngine
): Promise<string> {
  const sub = args[0] ?? 'briefing';

  try {
    switch (sub) {
      case 'briefing': {
        return briefingService.getDailyBriefing(userId);
      }

      case 'goals': {
        const statuses = await goalService.getGoalStatus(userId);
        if (statuses.length === 0) return formatBlock('GOAL STATUS', [{ label: 'INFO', lines: ['No active goals.'] }]);
        const sections = statuses.map(g => {
          const nextMilestone = g.milestones.find(m => !m.achieved_at);
          const achieved = g.milestones.filter(m => m.achieved_at).length;
          const lines = [
            `Progress: ${formatMinutes(g.totalProgress)} total`,
            `Milestones: ${achieved}/${g.milestones.length} achieved`,
          ];
          if (nextMilestone) {
            lines.push(
              `Next: ${nextMilestone.title} @ ${formatMinutes(nextMilestone.target_value)}${nextMilestone.is_final_exam ? ' [FINAL EXAM]' : ''}`
            );
          }
          return { label: g.categoryName.toUpperCase(), lines };
        });
        return formatBlock('GOAL STATUS', sections);
      }

      case 'mission': {
        const mission = await missionService.getActiveMission(userId);
        if (!mission) return formatBlock('MISSION STATUS', [{ label: 'INFO', lines: ['No active mission.'] }]);
        const elapsed = Math.round(
          (Date.now() - new Date(mission.started_at).getTime()) / 60000
        );
        return formatBlock('ACTIVE MISSION', [
          {
            label: mission.title.toUpperCase(),
            lines: [
              `Elapsed: ${formatMinutes(elapsed)}`,
              `ETA: ${mission.eta_minutes ? formatMinutes(mission.eta_minutes) : '—'}`,
              `Status: ${mission.status.toUpperCase()}`,
            ],
          },
        ]);
      }

      case 'score': {
        if (!disciplineScoreService) return formatError('Discipline score service not available.');
        const score = await disciplineScoreService.calculateAndSave(userId);
        return formatStatus('DISCIPLINE SCORE', {
          'Score':                `${score.score}/100`,
          'Mission consistency':  `${score.mission_consistency ?? '—'}%`,
          'Completion rate':      `${score.completion_rate ?? '—'}%`,
          'Estimation accuracy':  `${score.estimation_accuracy ?? '—'}%`,
          'Sleep consistency':    `${score.sleep_consistency ?? '—'}%`,
          'Focus duration':       `${score.focus_duration ?? '—'}%`,
          'Wake consistency':     `${score.wake_consistency ?? '—'}%`,
          'Habit adherence':      `${score.habit_adherence ?? '—'}%`,
          'Goal adherence':       `${score.goal_adherence ?? '—'}%`,
        });
      }

      case 'coaching': {
        if (!disciplineScoreService || !coachingEngine) {
          return formatError('Coaching service not available.');
        }
        const score = await disciplineScoreService.calculateAndSave(userId);
        const insights = coachingEngine.generate(score);
        await coachingEngine.saveInsights(userId, insights);
        const lines = insights.map((ins, i) => `[${i + 1}] ${ins.message}`);
        return formatBlock('COACHING INTEL', [{ label: 'INSIGHTS', lines }]);
      }

      default:
        return formatError(
          'Usage: /status briefing | /status goals | /status mission | /status score | /status coaching'
        );
    }
  } catch (err) {
    return formatError((err as Error).message);
  }
}
