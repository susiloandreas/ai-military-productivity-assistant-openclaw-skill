// Mock the DB connection before any imports that use it.
jest.mock('../../db/connection', () => ({
  pool: { query: jest.fn() },
  redisConnection: { options: {} },
}));

import { PlanService } from '../../services/PlanService';
import { PlanRepository } from '../../repositories/PlanRepository';
import { HabitRepository } from '../../repositories/HabitRepository';
import { HabitScheduleWithNames, PlanBlock } from '../../types';

// 2026-01-05 is a Monday (getDay() === 1).
const MONDAY = new Date(2026, 0, 5, 7, 0);

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

describe('PlanService.getTodayPlan', () => {
  let planRepo: jest.Mocked<PlanRepository>;
  let habitRepo: jest.Mocked<HabitRepository>;
  let service: PlanService;

  beforeEach(() => {
    planRepo = {
      getByDate: jest.fn(),
      insertMaterialized: jest.fn(),
      insertAdhoc: jest.fn(),
      getById: jest.fn(),
      updateStartTime: jest.fn(),
      setStatus: jest.fn(),
      markDone: jest.fn(),
      deleteProposed: jest.fn(),
    } as unknown as jest.Mocked<PlanRepository>;

    habitRepo = {
      getActiveSchedules: jest.fn(),
    } as unknown as jest.Mocked<HabitRepository>;

    service = new PlanService(planRepo, habitRepo);
  });

  it('materializes due schedules on the first read, then returns them', async () => {
    habitRepo.getActiveSchedules.mockResolvedValue([makeSchedule({ id: 'sched-1' })]);
    const materialized = makeBlock({ source_schedule_id: 'sched-1' });
    planRepo.getByDate.mockResolvedValueOnce([]).mockResolvedValueOnce([materialized]);

    const result = await service.getTodayPlan('user-1', MONDAY);

    expect(habitRepo.getActiveSchedules).toHaveBeenCalledWith('user-1');
    expect(planRepo.insertMaterialized).toHaveBeenCalledTimes(1);
    const [, planDate, blocks] = planRepo.insertMaterialized.mock.calls[0];
    expect(planDate).toBe('2026-01-05');
    expect(blocks.map(b => b.sourceScheduleId)).toEqual(['sched-1']);
    expect(result).toEqual([materialized]);
  });

  it('is idempotent: a re-read with all blocks present inserts nothing', async () => {
    habitRepo.getActiveSchedules.mockResolvedValue([makeSchedule({ id: 'sched-1' })]);
    planRepo.getByDate.mockResolvedValue([makeBlock({ source_schedule_id: 'sched-1' })]);

    const result = await service.getTodayPlan('user-1', MONDAY);

    expect(planRepo.insertMaterialized).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('excludes schedules not due on the current weekday', async () => {
    habitRepo.getActiveSchedules.mockResolvedValue([makeSchedule({ id: 'w', days_of_week: [0, 6] })]);
    planRepo.getByDate.mockResolvedValue([]);

    const result = await service.getTodayPlan('user-1', MONDAY);

    expect(planRepo.insertMaterialized).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('materializes only newly-due schedules and preserves edited blocks', async () => {
    habitRepo.getActiveSchedules.mockResolvedValue([
      makeSchedule({ id: 'a' }),
      makeSchedule({ id: 'c' }),
    ]);
    const movedA = makeBlock({ id: 'blk-a', source_schedule_id: 'a', status: 'moved', start_time: '17:00:00' });
    const newC = makeBlock({ id: 'blk-c', source_schedule_id: 'c' });
    planRepo.getByDate.mockResolvedValueOnce([movedA]).mockResolvedValueOnce([movedA, newC]);

    const result = await service.getTodayPlan('user-1', MONDAY);

    const [, , blocks] = planRepo.insertMaterialized.mock.calls[0];
    expect(blocks.map(b => b.sourceScheduleId)).toEqual(['c']);
    expect(result).toEqual([movedA, newC]);
  });
});

describe('PlanService edits', () => {
  let planRepo: jest.Mocked<PlanRepository>;
  let habitRepo: jest.Mocked<HabitRepository>;
  let service: PlanService;

  beforeEach(() => {
    planRepo = {
      getByDate: jest.fn().mockResolvedValue([]),
      insertMaterialized: jest.fn(),
      insertAdhoc: jest.fn(),
      getById: jest.fn(),
      updateStartTime: jest.fn(),
      setStatus: jest.fn(),
      markDone: jest.fn(),
      deleteProposed: jest.fn().mockResolvedValue(0),
      promoteProposed: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PlanRepository>;

    habitRepo = {
      getActiveSchedules: jest.fn().mockResolvedValue([]),
      findHabitTypeByName: jest.fn(),
    } as unknown as jest.Mocked<HabitRepository>;

    service = new PlanService(planRepo, habitRepo);
  });

  it('skipBlock marks the block skipped (a deliberate rest, not a miss)', async () => {
    await service.skipBlock('blk-1');
    expect(planRepo.setStatus).toHaveBeenCalledWith('blk-1', 'skipped');
  });

  it('snoozeBlock bumps the start time forward', async () => {
    planRepo.getById.mockResolvedValue(makeBlock({ id: 'blk-1', start_time: '06:00:00' }));
    await service.snoozeBlock('blk-1', 30);
    expect(planRepo.updateStartTime).toHaveBeenCalledWith('blk-1', '06:30');
  });

  it('addAdhoc links a known habit-type', async () => {
    habitRepo.findHabitTypeByName.mockResolvedValue({ id: 't9', name: 'reading' } as never);
    await service.addAdhoc('user-1', 'reading', '21:00', '30m', MONDAY);
    expect(planRepo.insertAdhoc).toHaveBeenCalledWith(
      'user-1',
      '2026-01-05',
      expect.objectContaining({ habitTypeId: 't9', title: 'reading', startTime: '21:00', durationMinutes: 30, sourceScheduleId: null })
    );
  });

  it('addAdhoc stores an unknown activity as a one-off (null type)', async () => {
    habitRepo.findHabitTypeByName.mockResolvedValue(null);
    await service.addAdhoc('user-1', 'call mom', '15:00', null, MONDAY);
    expect(planRepo.insertAdhoc).toHaveBeenCalledWith(
      'user-1',
      '2026-01-05',
      expect.objectContaining({ habitTypeId: null, title: 'call mom', startTime: '15:00', durationMinutes: null })
    );
  });

  it('markDoneForMission binds the completing mission to its in-window block', async () => {
    planRepo.getByDate.mockResolvedValue([makeBlock({ id: 'blk-1', habit_type_id: 't1', start_time: '06:00:00' })]);
    const mission = { id: 'm1', user_id: 'user-1', habit_type_id: 't1' } as never;
    await service.markDoneForMission(mission, new Date(2026, 0, 5, 6, 30));
    expect(planRepo.markDone).toHaveBeenCalledWith('blk-1', 'm1');
  });

  it('markDoneForMission is a no-op for a typeless mission', async () => {
    const mission = { id: 'm1', user_id: 'user-1', habit_type_id: null } as never;
    expect(await service.markDoneForMission(mission, MONDAY)).toBeNull();
    expect(planRepo.markDone).not.toHaveBeenCalled();
  });

  it('plannedMinutesForBlock uses the block duration when set', async () => {
    const block = makeBlock({ duration_minutes: 45 });
    expect(await service.plannedMinutesForBlock(block)).toBe(45);
    expect(habitRepo.getActiveSchedules).not.toHaveBeenCalled();
  });

  it('plannedMinutesForBlock falls back to the source schedule grace when block has none', async () => {
    habitRepo.getActiveSchedules.mockResolvedValue([makeSchedule({ id: 'sched-1', grace_minutes: 90 })]);
    const block = makeBlock({ duration_minutes: null, source_schedule_id: 'sched-1' });
    expect(await service.plannedMinutesForBlock(block)).toBe(90);
  });

  it('plannedMinutesForBlock returns null for a one-off block with no duration', async () => {
    const block = makeBlock({ duration_minutes: null, source_schedule_id: null });
    expect(await service.plannedMinutesForBlock(block)).toBeNull();
  });

  it('applyEdit moves a resolved target block', async () => {
    planRepo.getByDate.mockResolvedValue([makeBlock({ id: 'blk-1', title: 'lari', start_time: '06:00:00' })]);
    const out = await service.applyEdit('user-1', 'geser lari ke jam 5 sore', MONDAY);
    expect(out.ok).toBe(true);
    expect(planRepo.updateStartTime).toHaveBeenCalledWith('blk-1', '17:00');
  });

  it('applyEdit reports an unmatched target without mutating', async () => {
    planRepo.getByDate.mockResolvedValue([makeBlock({ id: 'blk-1', title: 'lari' })]);
    const out = await service.applyEdit('user-1', 'skip meditasi hari ini', MONDAY);
    expect(out.ok).toBe(false);
    expect(planRepo.setStatus).not.toHaveBeenCalled();
  });

  it('proposeDay writes proposed catch-up blocks for missed habits', async () => {
    habitRepo.getActiveSchedules.mockResolvedValue([]);
    const missed = makeBlock({ id: 'm', habit_type_id: 't1', title: 'run', status: 'planned', start_time: '06:00:00', duration_minutes: null });
    const proposed = makeBlock({ id: 'p', status: 'proposed', title: 'run', start_time: '10:30:00' });
    planRepo.getByDate.mockResolvedValueOnce([missed]).mockResolvedValueOnce([missed, proposed]);

    const result = await service.proposeDay('user-1', new Date(2026, 0, 5, 10, 0));

    expect(planRepo.deleteProposed).toHaveBeenCalled(); // clears any stale draft first
    const [, , drafts] = planRepo.insertMaterialized.mock.calls[0];
    expect(drafts.map(d => d.status)).toEqual(['proposed']);
    expect(result.map(b => b.status)).toEqual(['proposed']);
  });

  it('acceptProposed promotes proposed → planned via the repo', async () => {
    planRepo.promoteProposed.mockResolvedValue(2);
    expect(await service.acceptProposed('user-1', MONDAY)).toBe(2);
    expect(planRepo.promoteProposed).toHaveBeenCalledWith('user-1', '2026-01-05');
  });

  it('applyEdit("gas") accepts a pending proposal', async () => {
    planRepo.getByDate.mockResolvedValue([]);
    planRepo.promoteProposed.mockResolvedValue(1);
    const out = await service.applyEdit('user-1', 'gas', MONDAY);
    expect(out.ok).toBe(true);
    expect(planRepo.promoteProposed).toHaveBeenCalled();
  });

  it('applyEdit("tolak") with no proposal reports nothing to reject', async () => {
    planRepo.getByDate.mockResolvedValue([]);
    planRepo.deleteProposed.mockResolvedValue(0);
    const out = await service.applyEdit('user-1', 'tolak', MONDAY);
    expect(out.ok).toBe(false);
  });
});
