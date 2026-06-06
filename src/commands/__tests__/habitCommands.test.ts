jest.mock('../../db/connection', () => ({
  pool: { query: jest.fn() },
  redisConnection: { options: {} },
}));
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(true),
  })),
  Worker: jest.fn(),
}));

import { handleHabitCommand } from '../../commands/habitCommands';
import { HabitService } from '../../services/HabitService';
import { HabitCategory, HabitLog } from '../../types';

const makeCategory = (overrides: Partial<HabitCategory> = {}): HabitCategory => ({
  id: 'cat-1',
  user_id: 'user-1',
  name: 'exercise',
  description: null,
  created_at: new Date(),
  ...overrides,
});

const makeHabitLog = (overrides: Partial<HabitLog> = {}): HabitLog => ({
  id: 'log-1',
  habit_type_id: 'type-1',
  user_id: 'user-1',
  duration_minutes: 45,
  logged_at: new Date(),
  note: null,
  ...overrides,
});

describe('handleHabitCommand', () => {
  let service: jest.Mocked<HabitService>;

  beforeEach(() => {
    service = {
      addCategory: jest.fn(),
      listCategories: jest.fn(),
      logRetroactive: jest.fn(),
      getWeeklySummary: jest.fn(),
      setHabitGoal: jest.fn(),
    } as unknown as jest.Mocked<HabitService>;
  });

  describe('category add', () => {
    it('creates a category', async () => {
      service.addCategory.mockResolvedValue(makeCategory());
      const output = await handleHabitCommand(
        ['category', 'add', 'exercise'],
        'user-1',
        service
      );
      expect(service.addCategory).toHaveBeenCalledWith('user-1', 'exercise', undefined);
      expect(output).toContain('CATEGORY CREATED');
    });

    it('passes description flag', async () => {
      service.addCategory.mockResolvedValue(makeCategory());
      await handleHabitCommand(
        ['category', 'add', 'tennis', '--desc', 'court sport'],
        'user-1',
        service
      );
      expect(service.addCategory).toHaveBeenCalledWith('user-1', 'tennis', 'court sport');
    });

    it('returns error when no name given', async () => {
      const output = await handleHabitCommand(['category', 'add'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });
  });

  describe('category list', () => {
    it('lists categories', async () => {
      service.listCategories.mockResolvedValue([makeCategory({ name: 'exercise' })]);
      const output = await handleHabitCommand(['category', 'list'], 'user-1', service);
      expect(output).toContain('CATEGORIES');
      expect(output).toContain('exercise');
    });

    it('shows empty state when no categories', async () => {
      service.listCategories.mockResolvedValue([]);
      const output = await handleHabitCommand(['category', 'list'], 'user-1', service);
      expect(output).toContain('No categories yet');
    });
  });

  describe('log', () => {
    it('logs a habit retroactively', async () => {
      service.logRetroactive.mockResolvedValue({
        habitLog: makeHabitLog({ duration_minutes: 45 }),
        goalProgress: null,
        habitGoalProgress: null,
      });
      const output = await handleHabitCommand(
        ['log', 'exercise', 'running', '45m'],
        'user-1',
        service
      );
      expect(service.logRetroactive).toHaveBeenCalledWith(
        'user-1',
        'exercise',
        'running',
        '45m',
        undefined
      );
      expect(output).toContain('HABIT LOGGED');
    });

    it('shows goal progress when available', async () => {
      service.logRetroactive.mockResolvedValue({
        habitLog: makeHabitLog({ duration_minutes: 45 }),
        goalProgress: {
          goal: {} as any,
          progressLog: { value_delta: 45 } as any,
          totalProgress: 145,
          milestonesUnlocked: [],
          goalCompleted: false,
        },
        habitGoalProgress: null,
      });
      const output = await handleHabitCommand(
        ['log', 'exercise', 'running', '45m'],
        'user-1',
        service
      );
      expect(output).toContain('+45min');
      expect(output).toContain('total 145min');
    });

    it('returns error when args missing', async () => {
      const output = await handleHabitCommand(['log', 'exercise'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });
  });

  describe('goal set', () => {
    it('creates a goal for a habit', async () => {
      service.setHabitGoal.mockResolvedValue({
        goal: { title: 'running goal' } as any,
        milestone: { target_value: 3000 } as any,
      });
      const output = await handleHabitCommand(
        ['goal', 'set', 'exercise', 'running', '50h'],
        'user-1',
        service
      );
      expect(service.setHabitGoal).toHaveBeenCalledWith(
        'user-1', 'exercise', 'running', '50h', null
      );
      expect(output).toContain('HABIT GOAL SET');
      expect(output).toContain('running goal');
    });

    it('returns error when args missing', async () => {
      const output = await handleHabitCommand(['goal', 'set', 'exercise'], 'user-1', service);
      expect(output).toContain('OPERATION FAILED');
    });
  });

  describe('summary', () => {
    it('shows weekly summary', async () => {
      service.getWeeklySummary.mockResolvedValue([
        { name: 'exercise', total_minutes: 180 },
      ]);
      const output = await handleHabitCommand(['summary'], 'user-1', service);
      expect(output).toContain('HABIT SUMMARY');
      expect(output).toContain('exercise');
    });
  });
});
