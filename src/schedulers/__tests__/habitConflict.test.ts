import { findConflictingHabits } from '../idleReminderMessages';
import { replyConflictReminder } from '../telegramReplies';
import { HabitScheduleWithNames } from '../../types';

describe('Habit Conflict Detection', () => {
  const mockSchedule: HabitScheduleWithNames = {
    id: '1',
    habit_type_id: 'type1',
    habit_type_name: 'Workout',
    category_name: 'Exercise',
    expected_at: '07:00:00',
    grace_minutes: 30,
    days_of_week: [1, 3, 5], // Mon, Wed, Fri
    user_id: 'user1',
    active: true,
    created_at: new Date(),
  };

  const mockSchedule2: HabitScheduleWithNames = {
    id: '2',
    habit_type_id: 'type2',
    habit_type_name: 'Read',
    category_name: 'Learning',
    expected_at: '18:00:00',
    grace_minutes: 60,
    days_of_week: [0, 1, 2, 3, 4, 5, 6], // Every day
    user_id: 'user1',
    active: true,
    created_at: new Date(),
  };

  it('should detect habits due now', () => {
    // Current time: Monday 07:10
    const now = new Date();
    now.setDate(new Date().getDate() - (now.getDay() - 1)); // Set to Monday
    now.setHours(7, 10, 0, 0);

    const conflicts = findConflictingHabits([mockSchedule], new Set(), now);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].schedule.habit_type_name).toBe('Workout');
    expect(conflicts[0].status).toBe('due');
    expect(conflicts[0].minutesLeft).toBeGreaterThan(0);
  });

  it('should detect missed habits', () => {
    // Current time: Monday 07:45 (after grace window)
    const now = new Date();
    now.setDate(new Date().getDate() - (now.getDay() - 1)); // Set to Monday
    now.setHours(7, 45, 0, 0);

    const conflicts = findConflictingHabits([mockSchedule], new Set(), now);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].schedule.habit_type_name).toBe('Workout');
    expect(conflicts[0].status).toBe('missed');
    expect(conflicts[0].minutesLate).toBeGreaterThan(0);
  });

  it('should not detect habits on non-scheduled days', () => {
    // Current time: Tuesday 07:10 (Workout not scheduled on Tuesdays)
    const now = new Date();
    now.setDate(new Date().getDate() - (now.getDay() - 2)); // Set to Tuesday
    now.setHours(7, 10, 0, 0);

    const conflicts = findConflictingHabits([mockSchedule], new Set(), now);

    expect(conflicts.length).toBe(0);
  });

  it('should not detect already logged habits', () => {
    // Current time: Monday 07:10
    const now = new Date();
    now.setDate(new Date().getDate() - (now.getDay() - 1)); // Set to Monday
    now.setHours(7, 10, 0, 0);

    const loggedTypes = new Set(['type1']);
    const conflicts = findConflictingHabits([mockSchedule], loggedTypes, now);

    expect(conflicts.length).toBe(0);
  });

  it('should detect multiple conflicting habits', () => {
    // Current time: Monday 18:30 (Read is due, Workout already due/missed)
    const now = new Date();
    now.setDate(new Date().getDate() - (now.getDay() - 1)); // Set to Monday
    now.setHours(18, 30, 0, 0);

    const conflicts = findConflictingHabits(
      [mockSchedule, mockSchedule2],
      new Set(),
      now
    );

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some(c => c.schedule.habit_type_name === 'Read')).toBe(true);
  });

  describe('replyConflictReminder', () => {
    it('should build a reminder message when conflicts exist', () => {
      const now = new Date();
      now.setDate(new Date().getDate() - (now.getDay() - 1));
      now.setHours(7, 10, 0, 0);

      const conflicts = findConflictingHabits([mockSchedule], new Set(), now);
      const message = replyConflictReminder(conflicts, 'New mission');

      expect(message).not.toBeNull();
      expect(message).toContain('Workout');
      expect(message).toContain('New mission');
      expect(message).toContain('ya');
    });

    it('should return null when no conflicts', () => {
      const message = replyConflictReminder([], 'New mission');
      expect(message).toBeNull();
    });
  });
});
