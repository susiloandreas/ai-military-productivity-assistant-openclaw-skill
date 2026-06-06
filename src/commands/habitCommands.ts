import { HabitService } from '../services/HabitService';
import { ProgressResult } from '../services/GoalService';
import { formatSuccess, formatError, formatBlock } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';
import { parseTimeOfDay, parseDaysOfWeek, formatDaysOfWeek } from '../utils/schedule';

/**
 * /habit category add <name> [--desc <description>]
 * /habit category list
 * /habit log <category> <type> <duration> [--note <text>]
 * /habit goal set <category> <type> <target> [--deadline YYYY-MM-DD]
 * /habit schedule add <category> <type> <time> <days> [--grace <minutes>]
 * /habit schedule list
 * /habit summary
 */
export async function handleHabitCommand(
  args: string[],
  userId: string,
  service: HabitService
): Promise<string> {
  const sub = args[0];

  try {
    switch (sub) {
      case 'category': {
        const action = args[1];
        if (action === 'add') {
          const rest = args.slice(2);
          const desc = extractFlag(rest, '--desc');
          const name = rest.join(' ').trim();
          if (!name) return formatError('Category name required.');
          const cat = await service.addCategory(userId, name, desc ?? undefined);
          return formatSuccess('CATEGORY CREATED', [`Name: ${cat.name}`]);
        }
        if (action === 'list') {
          const cats = await service.listCategories(userId);
          if (cats.length === 0) return formatSuccess('CATEGORIES', ['No categories yet.']);
          return formatSuccess(
            'CATEGORIES',
            cats.map(c => `${c.name}${c.description ? ` — ${c.description}` : ''}`)
          );
        }
        return formatError('Usage: /habit category add <name> | /habit category list');
      }

      case 'log': {
        // /habit log <category> <type> <duration> [--note <text>]
        const rest = args.slice(1);
        const note = extractFlag(rest, '--note');
        const [categoryName, habitTypeName, durationStr] = rest;
        if (!categoryName || !habitTypeName || !durationStr) {
          return formatError('Usage: /habit log <category> <type> <duration>');
        }
        const { habitLog, goalProgress, habitGoalProgress } = await service.logRetroactive(
          userId,
          categoryName,
          habitTypeName,
          durationStr,
          note ?? undefined
        );
        const lines = [
          `Category: ${categoryName}`,
          `Type: ${habitTypeName}`,
          `Duration: ${formatMinutes(habitLog.duration_minutes)}`,
        ];
        appendGoalProgress(lines, `${habitTypeName} goal`, habitGoalProgress);
        appendGoalProgress(lines, `${categoryName} goal`, goalProgress);
        return formatSuccess('HABIT LOGGED', lines);
      }

      case 'goal': {
        const action = args[1];
        if (action === 'set') {
          // /habit goal set <category> <type> <target> [--deadline YYYY-MM-DD]
          const rest = args.slice(2);
          const deadlineStr = extractFlag(rest, '--deadline');
          const [categoryName, habitTypeName, targetStr] = rest;
          if (!categoryName || !habitTypeName || !targetStr) {
            return formatError(
              'Usage: /habit goal set <category> <type> <target> [--deadline YYYY-MM-DD]'
            );
          }
          let deadline: Date | null = null;
          if (deadlineStr) {
            deadline = new Date(deadlineStr);
            if (Number.isNaN(deadline.getTime())) {
              return formatError('--deadline must be a valid date (YYYY-MM-DD).');
            }
          }
          const { goal, milestone } = await service.setHabitGoal(
            userId,
            categoryName,
            habitTypeName,
            targetStr,
            deadline
          );
          const lines = [
            `Goal: ${goal.title}`,
            `Habit: ${habitTypeName} (${categoryName})`,
            `Target: ${formatMinutes(milestone.target_value)}`,
          ];
          if (deadline) lines.push(`Deadline: ${deadlineStr}`);
          return formatSuccess('HABIT GOAL SET', lines);
        }
        return formatError('Usage: /habit goal set <category> <type> <target> [--deadline YYYY-MM-DD]');
      }

      case 'schedule': {
        const action = args[1];
        if (action === 'add') {
          // /habit schedule add <category> <type> <time> <days> [--grace <minutes>]
          const rest = args.slice(2);
          const graceStr = extractFlag(rest, '--grace');
          const [categoryName, habitTypeName, timeStr, ...daysParts] = rest;
          if (!categoryName || !habitTypeName || !timeStr || daysParts.length === 0) {
            return formatError(
              'Usage: /habit schedule add <category> <type> <time> <days> [--grace <minutes>]'
            );
          }
          const expectedAt = parseTimeOfDay(timeStr);
          const daysOfWeek = parseDaysOfWeek(daysParts.join(' '));
          const graceMinutes = graceStr ? Number(graceStr) : undefined;
          if (graceStr && (!Number.isFinite(graceMinutes) || (graceMinutes as number) < 0)) {
            return formatError('--grace must be a non-negative number of minutes.');
          }
          await service.addSchedule(
            userId,
            categoryName,
            habitTypeName,
            expectedAt,
            daysOfWeek,
            graceMinutes
          );
          return formatSuccess('HABIT SCHEDULED', [
            `Habit: ${habitTypeName} (${categoryName})`,
            `Time: ${expectedAt}`,
            `Days: ${formatDaysOfWeek(daysOfWeek)}`,
            `Grace: ${graceMinutes ?? 90} min`,
          ]);
        }
        if (action === 'list') {
          const schedules = await service.listSchedules(userId);
          if (schedules.length === 0) {
            return formatSuccess('HABIT SCHEDULES', ['No schedules yet.']);
          }
          return formatSuccess(
            'HABIT SCHEDULES',
            schedules.map(
              s =>
                `${s.expected_at.slice(0, 5)} — ${s.habit_type_name} (${s.category_name}) — ` +
                `${formatDaysOfWeek(s.days_of_week)}`
            )
          );
        }
        return formatError('Usage: /habit schedule add ... | /habit schedule list');
      }

      case 'summary': {
        const summary = await service.getWeeklySummary(userId);
        if (summary.length === 0) return formatSuccess('HABIT SUMMARY', ['No data yet.']);
        const sections = [
          {
            label: 'WEEKLY (7 days)',
            lines: summary.map(s => `${s.name}: ${formatMinutes(Number(s.total_minutes))}`),
          },
        ];
        return formatBlock('HABIT SUMMARY', sections);
      }

      default:
        return formatError(
          'Usage: /habit category | /habit log | /habit goal | /habit schedule | /habit summary'
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
  const [, value] = args.splice(idx, 2);
  return value;
}
