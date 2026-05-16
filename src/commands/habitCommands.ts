import { HabitService } from '../services/HabitService';
import { formatSuccess, formatError, formatBlock } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';

/**
 * /habit category add <name> [--desc <description>]
 * /habit category list
 * /habit log <category> <type> <duration> [--note <text>]
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
        const { habitLog, goalProgress } = await service.logRetroactive(
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
        if (goalProgress) {
          lines.push(`Goal progress: +${goalProgress.progressLog.value_delta}min`);
          lines.push(`Total: ${goalProgress.totalProgress}min`);
          if (goalProgress.milestonesUnlocked.length > 0) {
            for (const m of goalProgress.milestonesUnlocked) {
              lines.push(`MILESTONE UNLOCKED: ${m.title}`);
            }
          }
        }
        return formatSuccess('HABIT LOGGED', lines);
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
        return formatError('Usage: /habit category | /habit log | /habit summary');
    }
  } catch (err) {
    return formatError((err as Error).message);
  }
}

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return null;
  const [, value] = args.splice(idx, 2);
  return value;
}
