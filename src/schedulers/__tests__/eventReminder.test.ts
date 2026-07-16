import { buildEventReminderMessage } from '../idleReminderMessages';
import { CalendarEventRecord } from '../../types';

function evt(over: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  return {
    id: 'x', user_id: 'u', calendar_id: 'primary', event_id: 'e',
    title: 'Standup', category: 'WORK', location: null,
    starts_at: new Date('2026-07-16T13:00:00+07:00'),
    ends_at: new Date('2026-07-16T13:15:00+07:00'),
    all_day: false, html_link: null, updated_at: new Date(),
    ...over,
  };
}

describe('buildEventReminderMessage', () => {
  it('tells the operator to finish the active mission', () => {
    const msg = buildEventReminderMessage(evt(), 'coba', 5);
    expect(msg).toContain('5 MENIT LAGI');
    expect(msg).toContain('Standup');
    expect(msg).toContain('[WORK]');
    expect(msg).toContain('coba');
    expect(msg).toContain('selesai');
  });

  it('is a plain heads-up when no mission is active', () => {
    const msg = buildEventReminderMessage(evt(), null, 4);
    expect(msg).toContain('4 MENIT LAGI');
    expect(msg).toContain('Standup');
    expect(msg).not.toContain('selesai');
    expect(msg).toContain('Bersiap');
  });

  it('escapes HTML in the title', () => {
    const msg = buildEventReminderMessage(evt({ title: 'A & B <x>' }), null, 5);
    expect(msg).toContain('A &amp; B &lt;x&gt;');
  });
});
