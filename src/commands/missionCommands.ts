import { MissionService } from '../services/MissionService';
import { ProgressResult } from '../services/GoalService';
import { formatSuccess, formatError, formatStatus, formatClockTime } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';

/**
 * /mission start <title> [--eta <duration>] [--category <name>]
 * /mission complete [--duration <duration>] [--notes <text>]
 * /mission log <category> <type> <duration> [--note <text>]
 * /mission abort
 * /mission extend <duration>
 * /mission status
 */
export async function handleMissionCommand(
  args: string[],
  userId: string,
  service: MissionService
): Promise<string> {
  const sub = args[0];

  try {
    switch (sub) {
      case 'start': {
        const rest = args.slice(1);
        const eta = extractFlag(rest, '--eta');
        const category = extractFlag(rest, '--category');
        const title = rest
          .filter(a => !a.startsWith('--'))
          .join(' ')
          .trim();
        if (!title) return formatError('Mission title required. Usage: /mission start <title>');
        const { mission, heldMission } = await service.start(userId, title, eta, category);
        const lines = [`Title: ${mission.title}`];
        if (mission.eta_minutes) lines.push(`ETA: ${formatMinutes(mission.eta_minutes)}`);
        if (mission.habit_category_id) lines.push(`Category linked`);
        if (heldMission) lines.push(`On hold: ${heldMission.title} (resume after this)`);
        return formatSuccess('MISSION INITIATED', lines);
      }

      case 'complete': {
        const rest = args.slice(1);
        const duration = extractFlag(rest, '--duration');
        const notes = extractFlag(rest, '--notes');
        const { mission, goalProgress } = await service.complete(userId, duration, notes);
        const lines: string[] = [
          `Mission: ${mission.title}`,
          `Duration: ${formatMinutes(mission.actual_duration_minutes ?? 0)}`,
        ];
        if (mission.completed_at) {
          lines.push(`End Time: ${formatClockTime(mission.completed_at)}`);
        }
        if (goalProgress) {
          lines.push(`Goal progress: +${goalProgress.progressLog.value_delta}min`);
          lines.push(`Total progress: ${goalProgress.totalProgress}min`);
          if (goalProgress.milestonesUnlocked.length > 0) {
            for (const m of goalProgress.milestonesUnlocked) {
              lines.push(`MILESTONE UNLOCKED: ${m.title}${m.is_final_exam ? ' [FINAL EXAM]' : ''}`);
            }
          }
          if (goalProgress.goalCompleted) {
            lines.push('GOAL ACHIEVED — MISSION ACCOMPLISHED');
          }
        }
        return formatSuccess('MISSION COMPLETE', lines);
      }

      case 'log': {
        // /mission log <category> <type> <duration> [--note <text>]
        const rest = args.slice(1);
        const note = extractFlag(rest, '--note');
        const [categoryName, habitTypeName, durationStr] = rest;
        if (!categoryName || !habitTypeName || !durationStr) {
          return formatError('Usage: /mission log <category> <type> <duration>');
        }
        const { mission, goalProgress, habitGoalProgress } = await service.logRetroactive(
          userId,
          categoryName,
          habitTypeName,
          durationStr,
          note
        );
        const lines = [
          `Category: ${categoryName}`,
          `Type: ${habitTypeName}`,
          `Duration: ${formatMinutes(mission.actual_duration_minutes ?? 0)}`,
        ];
        appendGoalProgress(lines, `${habitTypeName} goal`, habitGoalProgress);
        appendGoalProgress(lines, `${categoryName} goal`, goalProgress);
        return formatSuccess('ACTIVITY LOGGED', lines);
      }

      case 'abort': {
        const target = args.slice(1).join(' ').trim() || null;
        const mission = await service.abort(userId, target);
        return formatSuccess('MISSION ABORTED', [`Mission: ${mission.title}`]);
      }

      case 'extend': {
        const duration = args[1];
        if (!duration) return formatError('Duration required. Usage: /mission extend <duration>');
        const mission = await service.extend(userId, duration);
        return formatSuccess('ETA EXTENDED', [
          `Mission: ${mission.title}`,
          `New ETA: ${formatMinutes(mission.eta_minutes ?? 0)}`,
        ]);
      }

      case 'status': {
        const mission = await service.getActiveMission(userId);
        if (!mission) return formatStatus('MISSION STATUS', { Status: 'No active mission' });
        const elapsed = Math.round(
          (Date.now() - new Date(mission.started_at).getTime()) / 60000
        );
        return formatStatus('ACTIVE MISSION', {
          Title: mission.title,
          Elapsed: formatMinutes(elapsed),
          ETA: mission.eta_minutes ? formatMinutes(mission.eta_minutes) : '—',
          Status: mission.status.toUpperCase(),
        });
      }

      default:
        return formatError(
          'Unknown subcommand. Use: start | complete | log | abort | extend | status'
        );
    }
  } catch (err) {
    return formatError((err as Error).message);
  }
}

/** Append goal-progress lines (delta, total, milestones) for one advanced goal. */
function appendGoalProgress(
  lines: string[],
  label: string,
  progress: ProgressResult | null
): void {
  if (!progress) return;
  lines.push(`${label}: +${progress.progressLog.value_delta}min (total ${progress.totalProgress}min)`);
  for (const m of progress.milestonesUnlocked) {
    lines.push(`MILESTONE UNLOCKED: ${m.title}`);
  }
  if (progress.goalCompleted) lines.push(`GOAL ACHIEVED: ${label}`);
}

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return null;
  // Remove flag and its value from args (mutates the array)
  const [, value] = args.splice(idx, 2);
  return value;
}
