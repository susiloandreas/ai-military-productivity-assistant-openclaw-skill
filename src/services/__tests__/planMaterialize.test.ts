import {
  localDateStr,
  schedulesForWeekday,
  blockFromSchedule,
  missingScheduleBlocks,
} from '../planMaterialize';
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

describe('planMaterialize', () => {
  describe('localDateStr', () => {
    it('formats the local calendar day, zero-padded', () => {
      expect(localDateStr(new Date(2026, 0, 5, 6, 30))).toBe('2026-01-05');
      expect(localDateStr(new Date(2026, 11, 9, 23, 59))).toBe('2026-12-09');
    });
  });

  describe('schedulesForWeekday', () => {
    it('keeps only schedules whose days_of_week include the weekday', () => {
      const weekday = makeSchedule({ id: 'a', days_of_week: [1, 2, 3, 4, 5] });
      const weekend = makeSchedule({ id: 'b', days_of_week: [0, 6] });
      expect(schedulesForWeekday([weekday, weekend], 1).map(s => s.id)).toEqual(['a']);
      expect(schedulesForWeekday([weekday, weekend], 0).map(s => s.id)).toEqual(['b']);
    });
  });

  describe('blockFromSchedule', () => {
    it('maps schedule fields, with null duration and template provenance', () => {
      const b = blockFromSchedule(
        makeSchedule({ id: 'sched-9', habit_type_id: 't9', habit_type_name: 'reading', expected_at: '20:00:00' })
      );
      expect(b).toEqual({
        habitTypeId: 't9',
        title: 'reading',
        startTime: '20:00:00',
        durationMinutes: null,
        hardness: 'soft',
        sourceScheduleId: 'sched-9',
      });
    });
  });

  describe('missingScheduleBlocks', () => {
    it('returns only due schedules without an existing block', () => {
      const a = makeSchedule({ id: 'a' });
      const b = makeSchedule({ id: 'b' });
      const existing = [makeBlock({ source_schedule_id: 'a' })];
      expect(missingScheduleBlocks([a, b], existing).map(m => m.sourceScheduleId)).toEqual(['b']);
    });

    it('ignores ad-hoc blocks (null source) when deduping', () => {
      const a = makeSchedule({ id: 'a' });
      const existing = [makeBlock({ id: 'adhoc', source_schedule_id: null })];
      expect(missingScheduleBlocks([a], existing).map(m => m.sourceScheduleId)).toEqual(['a']);
    });
  });
});
