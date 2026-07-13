import {
  timeToMinutes,
  minutesToClock,
  resolveTargetBlock,
  nearestOpenBlock,
  nextUpcomingBlock,
  matchBlockForCompletion,
  planBlocksToSchedules,
  computeDayOutcomes,
  skippedTypeIds,
  draftCatchupBlocks,
} from '../planEdit';
import { selectDueHabits } from '../../schedulers/idleReminderMessages';
import { HabitScheduleWithNames, PlanBlock } from '../../types';

const makeSchedule = (o: Partial<HabitScheduleWithNames> = {}): HabitScheduleWithNames => ({
  id: 'sched-1',
  habit_type_id: 'type-1',
  user_id: 'user-1',
  expected_at: '06:00:00',
  grace_minutes: 90,
  days_of_week: [1, 2, 3, 4, 5],
  active: true,
  created_at: new Date(),
  habit_type_name: 'run',
  category_name: 'Exercise',
  ...o,
});

const makeBlock = (o: Partial<PlanBlock> = {}): PlanBlock => ({
  id: 'block-1',
  user_id: 'user-1',
  plan_date: '2026-01-05',
  habit_type_id: 'type-1',
  title: 'run',
  start_time: '06:00:00',
  duration_minutes: null,
  hardness: 'soft',
  status: 'planned',
  source_schedule_id: 'sched-1',
  completed_mission_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...o,
});

describe('clock math', () => {
  it('round-trips minutes and clock', () => {
    expect(timeToMinutes('06:30:00')).toBe(390);
    expect(minutesToClock(390)).toBe('06:30');
    expect(minutesToClock(timeToMinutes('06:00') + 30)).toBe('06:30');
  });

  it('clamps to a single day', () => {
    expect(minutesToClock(-10)).toBe('00:00');
    expect(minutesToClock(24 * 60 + 5)).toBe('23:59');
  });
});

describe('resolveTargetBlock', () => {
  const blocks = [
    makeBlock({ id: 'a', title: 'run' }),
    makeBlock({ id: 'b', title: 'english writing' }),
  ];

  it('matches an exact title (case-insensitive)', () => {
    expect(resolveTargetBlock(blocks, 'RUN')?.id).toBe('a');
  });

  it('matches a unique substring', () => {
    expect(resolveTargetBlock(blocks, 'english')?.id).toBe('b');
  });

  it('returns null when nothing matches', () => {
    expect(resolveTargetBlock(blocks, 'meditasi')).toBeNull();
  });

  it('returns null when ambiguous', () => {
    const dup = [makeBlock({ id: 'a', title: 'run' }), makeBlock({ id: 'b', title: 'run' })];
    expect(resolveTargetBlock(dup, 'run')).toBeNull();
  });
});

describe('nearestOpenBlock', () => {
  it('picks the open block closest in time and ignores done ones', () => {
    const blocks = [
      makeBlock({ id: 'morning', start_time: '06:00:00' }),
      makeBlock({ id: 'evening', start_time: '18:00:00' }),
      makeBlock({ id: 'noon-done', start_time: '12:00:00', status: 'done' }),
    ];
    expect(nearestOpenBlock(blocks, new Date(2026, 0, 5, 17, 0))?.id).toBe('evening');
  });
});

describe('nextUpcomingBlock', () => {
  it('picks the earliest still-open block after now', () => {
    const blocks = [
      makeBlock({ id: 'evening', start_time: '18:00:00' }),
      makeBlock({ id: 'afternoon', start_time: '14:00:00' }),
      makeBlock({ id: 'morning-done', start_time: '06:00:00', status: 'done' }),
    ];
    expect(nextUpcomingBlock(blocks, new Date(2026, 0, 5, 10, 0))?.id).toBe('afternoon');
  });

  it('ignores blocks that already started', () => {
    const blocks = [makeBlock({ id: 'morning', start_time: '06:00:00' })];
    expect(nextUpcomingBlock(blocks, new Date(2026, 0, 5, 10, 0))).toBeNull();
  });

  it('returns null when nothing is left today', () => {
    const blocks = [makeBlock({ id: 'done', start_time: '18:00:00', status: 'done' })];
    expect(nextUpcomingBlock(blocks, new Date(2026, 0, 5, 10, 0))).toBeNull();
  });

  it('includes moved blocks at their new time', () => {
    const blocks = [makeBlock({ id: 'moved', start_time: '20:00:00', status: 'moved' })];
    expect(nextUpcomingBlock(blocks, new Date(2026, 0, 5, 10, 0))?.id).toBe('moved');
  });
});

describe('matchBlockForCompletion', () => {
  it('matches a block of the same type inside its window', () => {
    const blocks = [makeBlock({ id: 'a', habit_type_id: 't1', start_time: '06:00:00' })];
    expect(matchBlockForCompletion(blocks, 't1', new Date(2026, 0, 5, 6, 30))?.id).toBe('a');
  });

  it('does not match a log far outside any window', () => {
    const blocks = [makeBlock({ id: 'a', habit_type_id: 't1', start_time: '06:00:00' })];
    expect(matchBlockForCompletion(blocks, 't1', new Date(2026, 0, 5, 23, 0))).toBeNull();
  });

  it('picks the nearer of two same-type blocks', () => {
    const blocks = [
      makeBlock({ id: 'am', habit_type_id: 't1', start_time: '06:00:00' }),
      makeBlock({ id: 'pm', habit_type_id: 't1', start_time: '18:00:00' }),
    ];
    expect(matchBlockForCompletion(blocks, 't1', new Date(2026, 0, 5, 18, 15))?.id).toBe('pm');
  });

  it('ignores done blocks and other types', () => {
    const blocks = [
      makeBlock({ id: 'done', habit_type_id: 't1', start_time: '06:00:00', status: 'done' }),
      makeBlock({ id: 'other', habit_type_id: 't2', start_time: '06:00:00' }),
    ];
    expect(matchBlockForCompletion(blocks, 't1', new Date(2026, 0, 5, 6, 30))).toBeNull();
  });
});

describe('planBlocksToSchedules', () => {
  const sched = makeSchedule({ id: 's1', habit_type_id: 't1', grace_minutes: 90, category_name: 'Exercise' });
  const byId = new Map([[sched.id, sched]]);
  const now = new Date(2026, 0, 5, 9, 0); // Monday

  it('includes planned/moved, excludes done/skipped/proposed and typeless', () => {
    const blocks = [
      makeBlock({ id: 'p', habit_type_id: 't1', source_schedule_id: 's1', status: 'planned', start_time: '06:00:00' }),
      makeBlock({ id: 'm', habit_type_id: 't2', source_schedule_id: 's1', status: 'moved', start_time: '17:00:00' }),
      makeBlock({ id: 'd', habit_type_id: 't3', status: 'done' }),
      makeBlock({ id: 'k', habit_type_id: 't4', status: 'skipped' }),
      makeBlock({ id: 'pr', habit_type_id: 't5', status: 'proposed' }),
      makeBlock({ id: 'adhoc', habit_type_id: null, status: 'planned' }),
    ];
    const out = planBlocksToSchedules(blocks, byId, now);
    expect(out.map(s => s.habit_type_id).sort()).toEqual(['t1', 't2']);
    expect(out.find(s => s.habit_type_id === 't2')!.expected_at).toBe('17:00:00'); // moved time
  });

  it('pulls grace + category from the source schedule', () => {
    const blocks = [makeBlock({ habit_type_id: 't1', source_schedule_id: 's1', status: 'planned' })];
    const [s] = planBlocksToSchedules(blocks, byId, now);
    expect(s.grace_minutes).toBe(90);
    expect(s.category_name).toBe('Exercise');
  });
});

describe('reminder parity for an unedited plan', () => {
  it('selectDueHabits agrees between the template and the plan-derived schedules', () => {
    const now = new Date(2026, 0, 5, 9, 0); // Monday, past the 06:00 window
    const schedules = [
      makeSchedule({ id: 's1', habit_type_id: 't1', expected_at: '06:00:00', grace_minutes: 90 }),
      makeSchedule({ id: 's2', habit_type_id: 't2', expected_at: '20:00:00', grace_minutes: 30 }),
    ];
    const byId = new Map(schedules.map(s => [s.id, s]));
    // Unedited plan = one materialized planned block per schedule.
    const blocks = schedules.map(s =>
      makeBlock({
        id: `b-${s.id}`,
        habit_type_id: s.habit_type_id,
        source_schedule_id: s.id,
        start_time: s.expected_at,
        status: 'planned',
        title: s.habit_type_name,
      })
    );
    const planDerived = planBlocksToSchedules(blocks, byId, now);

    const shape = (d: { schedule: HabitScheduleWithNames; status: string }) => ({ id: d.schedule.habit_type_id, status: d.status });
    expect(selectDueHabits(planDerived, new Set(), now).map(shape)).toEqual(
      selectDueHabits(schedules, new Set(), now).map(shape)
    );
  });
});

describe('computeDayOutcomes', () => {
  const sched = makeSchedule({ id: 's1', grace_minutes: 60 });
  const byId = new Map([[sched.id, sched]]);
  const now = new Date(2026, 0, 5, 12, 0); // noon

  it('classifies done / missed / skipped and ignores proposed', () => {
    const blocks = [
      makeBlock({ title: 'run', status: 'done' }),
      makeBlock({ title: 'read', status: 'skipped' }),
      // 06:00 + 60 grace = 07:00 < noon → missed
      makeBlock({ title: 'meditate', status: 'planned', start_time: '06:00:00', source_schedule_id: 's1', duration_minutes: null }),
      // 13:00 → still future → not missed
      makeBlock({ title: 'lunch', status: 'planned', start_time: '13:00:00', duration_minutes: 60 }),
      makeBlock({ title: 'draft', status: 'proposed' }),
    ];
    const o = computeDayOutcomes(blocks, byId, now);
    expect(o.done).toEqual(['run']);
    expect(o.skipped).toEqual(['read']);
    expect(o.missed).toEqual(['meditate']);
    expect(o.planned).toBe(4); // excludes the proposed block
  });
});

describe('skippedTypeIds', () => {
  it('collects the habit-types of skipped blocks only', () => {
    const blocks = [
      makeBlock({ habit_type_id: 't1', status: 'skipped' }),
      makeBlock({ habit_type_id: 't2', status: 'planned' }),
      makeBlock({ habit_type_id: null, status: 'skipped' }),
    ];
    expect([...skippedTypeIds(blocks)]).toEqual(['t1']);
  });
});

describe('draftCatchupBlocks', () => {
  const byId = new Map([['s1', makeSchedule({ id: 's1', grace_minutes: 60 })]]);

  it('proposes a staggered catch-up block per missed habit', () => {
    const now = new Date(2026, 0, 5, 10, 0); // 10:00
    const blocks = [
      // 06:00 + 60 grace = 07:00 < 10:00 → missed
      makeBlock({ habit_type_id: 't1', title: 'run', status: 'planned', start_time: '06:00:00', source_schedule_id: 's1' }),
      makeBlock({ habit_type_id: 't2', title: 'read', status: 'planned', start_time: '20:00:00', duration_minutes: 30 }), // future
      makeBlock({ habit_type_id: 't3', title: 'workout', status: 'done' }),
    ];
    const drafts = draftCatchupBlocks(blocks, byId, now);
    expect(drafts.map(d => d.title)).toEqual(['run']);
    expect(drafts[0].status).toBe('proposed');
    expect(drafts[0].sourceScheduleId).toBeNull();
    expect(drafts[0].startTime).toBe('10:30'); // ceil((600+15)/30)*30 = 630
  });

  it('proposes nothing when nothing is missed', () => {
    const now = new Date(2026, 0, 5, 5, 0);
    const blocks = [makeBlock({ habit_type_id: 't1', status: 'planned', start_time: '20:00:00' })];
    expect(draftCatchupBlocks(blocks, byId, now)).toEqual([]);
  });
});
