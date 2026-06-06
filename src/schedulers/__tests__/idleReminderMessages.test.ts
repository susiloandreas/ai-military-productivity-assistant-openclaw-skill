import {
  selectDueHabits,
  buildHabitLossAversionMessage,
  randomIdleMessage,
  findSeharusnyaHabit,
  buildGenericIdleMessage,
  IDLE_MESSAGES,
} from '../idleReminderMessages';
import { HabitScheduleWithNames } from '../../types';

// Deterministic RNG: always picks the first variant in every pool.
const FIRST = () => 0;

// 2026-06-08 is a Monday (getDay() === 1); 2026-06-09 is a Tuesday.
const MONDAY = (h: number, m = 0) => new Date(2026, 5, 8, h, m, 0);
const TUESDAY = (h: number, m = 0) => new Date(2026, 5, 9, h, m, 0);

function schedule(overrides: Partial<HabitScheduleWithNames>): HabitScheduleWithNames {
  return {
    id: 's1',
    habit_type_id: 't1',
    user_id: 'u1',
    expected_at: '06:00:00',
    grace_minutes: 90, // window 06:00–07:30
    days_of_week: [1, 3, 5],
    active: true,
    created_at: MONDAY(0),
    habit_type_name: 'running',
    category_name: 'exercise',
    ...overrides,
  };
}

const NONE = new Set<string>();

describe('selectDueHabits', () => {
  it('flags a habit as missed once the grace window has passed and it is unlogged', () => {
    const due = selectDueHabits([schedule({})], NONE, MONDAY(8)); // 08:00 > 07:30
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('missed');
    expect(due[0].minutesLate).toBe(30);
  });

  it('flags a habit as due while inside the grace window', () => {
    const due = selectDueHabits([schedule({})], NONE, MONDAY(7)); // 07:00 in window
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe('due');
    expect(due[0].minutesLeft).toBe(30);
  });

  it('ignores a habit before its expected time', () => {
    expect(selectDueHabits([schedule({})], NONE, MONDAY(5))).toHaveLength(0);
  });

  it('ignores a habit already logged today', () => {
    const logged = new Set(['t1']);
    expect(selectDueHabits([schedule({})], logged, MONDAY(8))).toHaveLength(0);
  });

  it('ignores a habit not scheduled for today', () => {
    // Tuesday (day 2) is not in [1,3,5]
    expect(selectDueHabits([schedule({})], NONE, TUESDAY(8))).toHaveLength(0);
  });

  it('lists missed habits before due habits', () => {
    const items = selectDueHabits(
      [
        schedule({ id: 'a', habit_type_id: 'a', habit_type_name: 'reading', expected_at: '09:00:00' }),
        schedule({ id: 'b', habit_type_id: 'b', habit_type_name: 'running', expected_at: '06:00:00' }),
      ],
      NONE,
      MONDAY(9, 15) // running (06:00) missed; reading (09:00) due
    );
    expect(items.map(i => `${i.schedule.habit_type_name}:${i.status}`)).toEqual([
      'running:missed',
      'reading:due',
    ]);
  });
});

describe('buildHabitLossAversionMessage', () => {
  it('returns null when nothing is due or missed', () => {
    expect(buildHabitLossAversionMessage([schedule({})], NONE, MONDAY(5), FIRST)).toBeNull();
  });

  it('uses a failure header and names the missed habit', () => {
    const msg = buildHabitLossAversionMessage([schedule({})], NONE, MONDAY(8), FIRST)!;
    expect(msg).toContain('GAGAL MENEPATI');
    expect(msg).toContain('running');
    expect(msg).toContain('06:00');
    expect(msg).toContain('LEWAT');
  });

  it('uses an urgency header when only due (not yet missed)', () => {
    const msg = buildHabitLossAversionMessage([schedule({})], NONE, MONDAY(7), FIRST)!;
    expect(msg).toContain('JATAH WAKTU');
    expect(msg).toContain('tersisa');
  });

  it('varies the wording with different RNG but always names the habit', () => {
    const first = buildHabitLossAversionMessage([schedule({})], NONE, MONDAY(8), () => 0)!;
    const last = buildHabitLossAversionMessage([schedule({})], NONE, MONDAY(8), () => 0.99)!;
    expect(first).not.toBe(last); // different header/intro/closer/cta
    expect(first).toContain('running');
    expect(last).toContain('running');
    expect(last).toContain('LEWAT');
  });
});

describe('findSeharusnyaHabit', () => {
  it('returns the most recently past scheduled habit today', () => {
    const s1 = schedule({ id: 'a', habit_type_id: 'a', expected_at: '06:00:00', habit_type_name: 'running' });
    const s2 = schedule({ id: 'b', habit_type_id: 'b', expected_at: '08:00:00', habit_type_name: 'reading', days_of_week: [1, 2, 3, 4, 5] });
    // At 09:00 Monday — both are past; reading (08:00) is more recent
    const result = findSeharusnyaHabit([s1, s2], NONE, MONDAY(9));
    expect(result?.habit_type_name).toBe('reading');
  });

  it('returns null when all past habits are already logged', () => {
    const logged = new Set(['t1']);
    const result = findSeharusnyaHabit([schedule({})], logged, MONDAY(9));
    expect(result).toBeNull();
  });

  it('returns null when no habits have started yet today', () => {
    const result = findSeharusnyaHabit([schedule({})], NONE, MONDAY(5)); // before 06:00
    expect(result).toBeNull();
  });

  it('falls back to yesterday evening habits before 08:00', () => {
    // Schedule at 22:00 on Sundays (day 0); MONDAY 01:00 = early morning, yesterdayWeekday = 0
    const sleepSchedule = schedule({
      id: 'sleep',
      habit_type_id: 'sleep',
      expected_at: '22:00:00',
      habit_type_name: 'Tidur Malam',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
    });
    const result = findSeharusnyaHabit([sleepSchedule], NONE, MONDAY(1)); // 01:00 Monday
    expect(result?.habit_type_name).toBe('Tidur Malam');
  });

  it('does NOT fall back to yesterday when past 08:00', () => {
    const sleepSchedule = schedule({
      id: 'sleep',
      habit_type_id: 'sleep',
      expected_at: '22:00:00',
      habit_type_name: 'Tidur Malam',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
    });
    const result = findSeharusnyaHabit([sleepSchedule], NONE, MONDAY(9)); // 09:00 — no today past, no fallback
    expect(result).toBeNull();
  });
});

describe('buildGenericIdleMessage', () => {
  it('returns a plain idle message when no seharusnya habit', () => {
    const msg = buildGenericIdleMessage(null, () => 0);
    expect(msg).toBe(IDLE_MESSAGES[0]);
  });

  it('injects SEHARUSNYA line with habit name and time when habit is provided', () => {
    const s = schedule({ expected_at: '06:00:00', habit_type_name: 'Lari Pagi', category_name: 'Fisik' });
    const msg = buildGenericIdleMessage(s, () => 0);
    expect(msg).toContain('SEHARUSNYA');
    expect(msg).toContain('Lari Pagi');
    expect(msg).toContain('06:00');
    expect(msg).toContain('Fisik');
  });

  it('places the seharusnya line before the final CTA paragraph', () => {
    const s = schedule({ habit_type_name: 'Lari Pagi', category_name: 'Fisik' });
    const msg = buildGenericIdleMessage(s, () => 0);
    const seharusnyaIdx = msg.indexOf('SEHARUSNYA');
    const ctaIdx = msg.indexOf('WAJIB');
    expect(seharusnyaIdx).toBeGreaterThan(0);
    expect(seharusnyaIdx).toBeLessThan(ctaIdx);
  });
});

describe('randomIdleMessage', () => {
  it('returns the first variant with a zero RNG', () => {
    expect(randomIdleMessage(() => 0)).toBe(IDLE_MESSAGES[0]);
  });

  it('returns the last variant with a near-one RNG', () => {
    expect(randomIdleMessage(() => 0.99)).toBe(IDLE_MESSAGES[IDLE_MESSAGES.length - 1]);
  });

  it('only ever returns a message from the pool', () => {
    for (let i = 0; i < 20; i++) {
      expect(IDLE_MESSAGES).toContain(randomIdleMessage());
    }
  });
});
