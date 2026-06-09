import {
  slotForHour,
  nextRunDelayMs,
  buildCoachingContext,
  buildCoachingPrompt,
  contextSummary,
  computeHabitAdherence,
  fallbackCoaching,
  isNearCoachingSlot,
  coachingDedupKey,
  COACHING_HOURS,
} from '../coachingContext';
import { Mission, HabitScheduleWithNames } from '../../types';

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    user_id: 'u1',
    title: 'Coding',
    habit_category_id: null,
    habit_type_id: null,
    eta_minutes: null,
    mode: 'live',
    status: 'active',
    started_at: new Date(),
    completed_at: null,
    paused_at: null,
    actual_duration_minutes: null,
    notes: null,
    created_at: new Date(),
    ...overrides,
  } as Mission;
}

describe('slotForHour', () => {
  it('maps the three coaching hours to morning/afternoon/night', () => {
    expect(slotForHour(7)).toBe('pagi');
    expect(slotForHour(13)).toBe('siang');
    expect(slotForHour(23)).toBe('malam');
  });
});

describe('nextRunDelayMs', () => {
  it('picks the next future hour today', () => {
    const now = new Date('2026-06-08T08:00:00');
    expect(nextRunDelayMs(now).hour).toBe(13);
  });

  it('rolls over to the first hour tomorrow after the last slot', () => {
    const now = new Date('2026-06-08T23:30:00');
    const { hour, delayMs } = nextRunDelayMs(now);
    expect(hour).toBe(7);
    // 7:00 next day is 7.5h away
    expect(Math.round(delayMs / 60000)).toBe(7 * 60 + 30);
  });

  it('always returns a strictly positive delay at an exact slot time', () => {
    const now = new Date('2026-06-08T07:00:00');
    const { hour, delayMs } = nextRunDelayMs(now);
    expect(delayMs).toBeGreaterThan(0);
    expect(hour).toBe(13); // 07:00 already passed (not strictly future)
  });

  it('uses the three configured hours', () => {
    expect(COACHING_HOURS).toEqual([7, 13, 23]);
  });
});

describe('buildCoachingContext + summary', () => {
  const now = new Date('2026-06-08T13:00:00');
  const startOfToday = new Date('2026-06-08T00:00:00');

  it('summarizes active mission, today completions and missed habits', () => {
    const schedules: HabitScheduleWithNames[] = [
      {
        id: 's1',
        user_id: 'u1',
        habit_type_id: 'ht-run',
        expected_at: '06:00:00',
        grace_minutes: 60,
        days_of_week: [now.getDay()],
        active: true,
        created_at: now,
        habit_type_name: 'Lari Pagi',
        category_name: 'Fisik',
      } as HabitScheduleWithNames,
    ];

    const ctx = buildCoachingContext({
      slot: 'siang',
      activeMission: mission({ title: 'Refactor', eta_minutes: 60 }),
      held: [mission({ title: 'Old' })],
      recentCompleted: [
        mission({ title: 'Reading', actual_duration_minutes: 30, completed_at: new Date('2026-06-08T09:00:00') }),
        mission({ title: 'Last week', actual_duration_minutes: 45, completed_at: new Date('2026-06-02T09:00:00') }),
      ],
      schedules,
      loggedTypeIds: new Set<string>(), // Lari Pagi not logged → missed
      now,
    });

    expect(ctx.todayCompleted).toEqual([{ title: 'Reading', minutes: 30 }]);
    expect(ctx.weekCompletedCount).toBe(2);
    expect(ctx.heldCount).toBe(1);

    const summary = contextSummary(ctx);
    expect(summary).toContain('Refactor');
    expect(summary).toContain('Reading');
    expect(summary).toContain('Lari Pagi'); // missed habit surfaced
  });

  it('builds a general prompt enforcing brevity, semangat and loss-aversion', () => {
    const ctx = buildCoachingContext({
      slot: 'siang',
      activeMission: null,
      held: [],
      recentCompleted: [],
      schedules: [],
      loggedTypeIds: new Set<string>(),
      now: startOfToday,
    });
    const prompt = buildCoachingPrompt(ctx);
    expect(prompt).toMatch(/SEMANGAT/i);
    expect(prompt).toMatch(/TAKUT KEHILANGAN MIMPI/i);
    expect(prompt).toMatch(/Bahasa Indonesia/i);
    expect(prompt).toContain('TIDAK ADA'); // no active mission reflected in data
  });

  it('builds a morning prompt focused on loss-aversion review of yesterday', () => {
    const ctx = buildCoachingContext({
      slot: 'pagi',
      activeMission: null,
      held: [],
      recentCompleted: [],
      schedules: [],
      loggedTypeIds: new Set<string>(),
      now: startOfToday,
    });
    const prompt = buildCoachingPrompt(ctx);
    expect(prompt).toMatch(/LOSS AVERSION/i);
    expect(prompt).toMatch(/KEMARIN/i);
    expect(prompt).toMatch(/Bahasa Indonesia/i);
  });
});

describe('computeHabitAdherence', () => {
  // 2026-06-08 is a Monday; the window is the 7 days ending Sun 2026-06-07.
  const now = new Date('2026-06-08T07:00:00');
  const daily = [0, 1, 2, 3, 4, 5, 6];

  const schedule = (id: string, name: string): HabitScheduleWithNames =>
    ({
      id,
      user_id: 'u1',
      habit_type_id: id,
      expected_at: '06:00:00',
      grace_minutes: 60,
      days_of_week: daily,
      active: true,
      created_at: now,
      habit_type_name: name,
      category_name: 'Fisik',
    } as HabitScheduleWithNames);

  it('counts scheduled vs logged days over the window, today excluded', () => {
    const completed = [
      mission({ habit_type_id: 'ht-run', completed_at: new Date('2026-06-07T06:30:00') }),
      mission({ habit_type_id: 'ht-run', completed_at: new Date('2026-06-05T06:30:00') }),
      // Today's log must NOT count — the day isn't over.
      mission({ habit_type_id: 'ht-run', completed_at: new Date('2026-06-08T06:30:00') }),
    ];
    const [run] = computeHabitAdherence([schedule('ht-run', 'Lari')], completed, now);
    expect(run).toMatchObject({ habitTypeName: 'Lari', scheduled: 7, logged: 2 });
  });

  it('sorts the most-neglected habit first', () => {
    const completed = [
      mission({ habit_type_id: 'ht-run', completed_at: new Date('2026-06-06T06:30:00') }),
    ];
    const metrics = computeHabitAdherence(
      [schedule('ht-run', 'Lari'), schedule('ht-read', 'Baca')],
      completed,
      now
    );
    expect(metrics.map(m => m.habitTypeName)).toEqual(['Baca', 'Lari']); // 0/7 before 1/7
  });

  it('surfaces the metric block and a neglect flag in the morning summary', () => {
    const ctx = buildCoachingContext({
      slot: 'pagi',
      activeMission: null,
      held: [],
      recentCompleted: [],
      schedules: [schedule('ht-read', 'Baca')],
      loggedTypeIds: new Set<string>(),
      now,
    });
    const summary = contextSummary(ctx);
    expect(summary).toContain('METRIK KEBIASAAN');
    expect(summary).toContain('Baca: 0/7');
    expect(summary).toContain('TERABAIKAN');
  });

  it('is empty for non-morning slots', () => {
    const ctx = buildCoachingContext({
      slot: 'siang',
      activeMission: null,
      held: [],
      recentCompleted: [],
      schedules: [schedule('ht-read', 'Baca')],
      loggedTypeIds: new Set<string>(),
      now,
    });
    expect(ctx.habitMetrics).toEqual([]);
  });
});

describe('isNearCoachingSlot / dedupKey', () => {
  it('flags times within the window of a coaching slot', () => {
    expect(isNearCoachingSlot(new Date('2026-06-08T07:10:00'))).toBe(true); // +10m of 07:00
    expect(isNearCoachingSlot(new Date('2026-06-08T12:50:00'))).toBe(true); // -10m of 13:00
    expect(isNearCoachingSlot(new Date('2026-06-08T23:00:00'))).toBe(true);
  });

  it('does not flag times well away from any slot', () => {
    expect(isNearCoachingSlot(new Date('2026-06-08T09:30:00'))).toBe(false);
    expect(isNearCoachingSlot(new Date('2026-06-08T15:00:00'))).toBe(false);
  });

  it('builds a stable per-day, per-slot dedup key', () => {
    expect(coachingDedupKey(new Date('2026-06-08T07:00:00'), 'pagi')).toBe('coaching:2026-06-08:pagi');
  });
});

describe('fallbackCoaching', () => {
  const ctxFor = (slot: 'pagi' | 'siang' | 'malam') =>
    buildCoachingContext({
      slot,
      activeMission: null,
      held: [],
      recentCompleted: [],
      schedules: [],
      loggedTypeIds: new Set<string>(),
      now: new Date('2026-06-08T00:00:00'),
    });

  it('returns a slot-specific motivational message', () => {
    expect(fallbackCoaching(ctxFor('pagi'))).toContain('PAGI');
    expect(fallbackCoaching(ctxFor('siang'))).toContain('SIANG');
    expect(fallbackCoaching(ctxFor('malam'))).toContain('MALAM');
    expect(fallbackCoaching(ctxFor('malam'))).toMatch(/mimpi/i);
  });
});
