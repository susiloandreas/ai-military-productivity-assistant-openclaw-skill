import { CalendarSyncResult } from '../services/CalendarSyncService';

/**
 * Compose the Telegram summary for a calendar sync run. Pure (no I/O) so the
 * formatting is unit-testable. Plain text — sendTelegramMessage uses HTML parse
 * mode, so we avoid <, >, and & here.
 */
export function composeCalendarSyncMessage(r: CalendarSyncResult): string {
  const lines: string[] = ['📅 Calendar Sync', ''];
  lines.push(`Calendars: ${r.calendars}`);
  lines.push(`Synced: ${r.synced} event(s)` + (r.pruned > 0 ? ` (pruned ${r.pruned})` : ''));
  lines.push(`Window: ${r.window.from.slice(0, 10)} → ${r.window.to.slice(0, 10)}`);

  const cats = Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]);
  if (cats.length > 0) {
    lines.push('', 'By category:');
    for (const [cat, n] of cats) lines.push(`• ${cat}: ${n}`);
  }

  if (r.errors.length > 0) {
    lines.push('', `⚠ ${r.errors.length} calendar error(s):`);
    for (const e of r.errors) lines.push(`• ${e.calendar}: ${e.message}`);
  }

  return lines.join('\n');
}
