import { CalendarSyncService } from '../services/CalendarSyncService';
import { CalendarEventRepository } from '../repositories/CalendarEventRepository';
import { CalendarEventRecord } from '../types';
import { formatSuccess, formatError } from '../utils/formatter';

/**
 * /calendar sync [--past N] [--future N]  — mirror all Google calendars
 * /calendar list [CATEGORY]               — upcoming events (optional #category)
 */
export async function handleCalendarCommand(
  args: string[],
  userId: string,
  syncService: CalendarSyncService,
  eventRepo: CalendarEventRepository
): Promise<string> {
  const sub = args[0] ?? 'list';

  try {
    switch (sub) {
      case 'sync': {
        const rest = args.slice(1);
        const past = numFlag(rest, '--past');
        const future = numFlag(rest, '--future');
        const r = await syncService.syncAll(userId, { pastDays: past, futureDays: future });
        const cats = Object.entries(r.byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `  ${c}: ${n}`);
        const lines = [
          `Calendars: ${r.calendars}`,
          `Synced: ${r.synced} event(s)` + (r.pruned ? `, pruned ${r.pruned}` : ''),
          `Window: ${r.window.from.slice(0, 10)} → ${r.window.to.slice(0, 10)}`,
          ...(cats.length ? ['By category:', ...cats] : []),
          ...(r.errors.length ? ['Errors:', ...r.errors.map(e => `  ${e.calendar}: ${e.message}`)] : []),
        ];
        return formatSuccess('CALENDAR SYNC', lines);
      }

      case 'list': {
        const category = args[1];
        const events = await eventRepo.list(userId, {
          from: new Date().toISOString(),
          category,
          limit: 30,
        });
        if (events.length === 0) {
          return formatSuccess('CALENDAR', [
            category ? `No upcoming events tagged #${category.toUpperCase()}.` : 'No upcoming events. Run /calendar sync.',
          ]);
        }
        return formatSuccess(
          category ? `CALENDAR — #${category.toUpperCase()}` : 'CALENDAR — UPCOMING',
          events.map(formatEventLine)
        );
      }

      default:
        return formatError('Usage: /calendar sync [--past N] [--future N] | /calendar list [CATEGORY]');
    }
  } catch (err) {
    return formatError((err as Error).message);
  }
}

const TZ = process.env.TZ || 'Asia/Jakarta';

function formatEventLine(e: CalendarEventRecord): string {
  const when = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...(e.all_day ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
    timeZone: TZ,
  }).format(new Date(e.starts_at));
  const tag = e.category ? ` [${e.category}]` : '';
  return `${when} — ${e.title}${tag}`;
}

function numFlag(args: string[], flag: string): number | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return undefined;
  const n = Number(args[idx + 1]);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
