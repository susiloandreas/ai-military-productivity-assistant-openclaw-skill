import { composeCalendarSyncMessage } from '../composeCalendarSync';
import { CalendarSyncResult } from '../../services/CalendarSyncService';

const base: CalendarSyncResult = {
  calendars: 4,
  synced: 37,
  pruned: 0,
  byCategory: { WORK: 20, UNTAGGED: 9, FITNESS: 8 },
  window: { from: '2026-07-09T00:00:00.000Z', to: '2026-10-14T00:00:00.000Z' },
  errors: [],
};

describe('composeCalendarSyncMessage', () => {
  it('summarizes counts, window and categories (sorted by count desc)', () => {
    const msg = composeCalendarSyncMessage(base);
    expect(msg).toContain('Calendars: 4');
    expect(msg).toContain('Synced: 37 event(s)');
    expect(msg).toContain('Window: 2026-07-09 → 2026-10-14');
    // WORK (20) before FITNESS (8) before UNTAGGED... actually UNTAGGED=9 > FITNESS=8
    expect(msg.indexOf('• WORK: 20')).toBeLessThan(msg.indexOf('• UNTAGGED: 9'));
    expect(msg.indexOf('• UNTAGGED: 9')).toBeLessThan(msg.indexOf('• FITNESS: 8'));
  });

  it('notes pruned events when any were removed', () => {
    expect(composeCalendarSyncMessage({ ...base, pruned: 3 })).toContain('(pruned 3)');
  });

  it('omits the pruned note when nothing was pruned', () => {
    expect(composeCalendarSyncMessage(base)).not.toContain('pruned');
  });

  it('lists per-calendar errors when present', () => {
    const msg = composeCalendarSyncMessage({
      ...base,
      errors: [{ calendar: 'Holidays', message: 'HTTP 403' }],
    });
    expect(msg).toContain('⚠ 1 calendar error(s):');
    expect(msg).toContain('• Holidays: HTTP 403');
  });

  it('avoids HTML-breaking characters', () => {
    const msg = composeCalendarSyncMessage(base);
    expect(msg).not.toMatch(/[<>&]/);
  });
});
