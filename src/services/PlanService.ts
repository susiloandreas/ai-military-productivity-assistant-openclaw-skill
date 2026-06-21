import { PlanRepository } from '../repositories/PlanRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { HabitScheduleWithNames, Mission, PlanBlock } from '../types';
import { localDateStr, schedulesForWeekday, missingScheduleBlocks } from './planMaterialize';
import {
  resolveTargetBlock,
  nearestOpenBlock,
  matchBlockForCompletion,
  planBlocksToSchedules,
  skippedTypeIds,
  computeDayOutcomes,
  draftCatchupBlocks,
  DayOutcomes,
  timeToMinutes,
  minutesToClock,
  nowMinutes,
} from './planEdit';
import { parsePlanEdit } from '../nlp/planParser';
import { parseDurationToMinutes } from '../utils/duration';

/** Result of applying a natural-language plan edit, for the command reply. */
export interface PlanEditOutcome {
  ok: boolean;
  message: string;
  block?: PlanBlock;
}

/**
 * Owns the adaptive daily plan: the "today's orders" layer derived from the
 * recurring habit-schedule template. Materialization and edit rules live here;
 * the pure parts are in planMaterialize / planEdit. The template (habit_schedules)
 * is never mutated — edits live only on the dated plan_blocks.
 */
export class PlanService {
  constructor(
    private planRepo: PlanRepository,
    private habitRepo: HabitRepository
  ) {}

  /**
   * Today's plan. Materialized lazily on the first read of the local day from the
   * active schedules due this weekday, then returned as-is on later reads. Only
   * schedules without a block yet are filled, so prior edits (moves/skips) and
   * ad-hoc additions are preserved and a re-read never duplicates.
   */
  async getTodayPlan(userId: string, now: Date = new Date()): Promise<PlanBlock[]> {
    const planDate = localDateStr(now);
    const existing = await this.planRepo.getByDate(userId, planDate);

    const schedules = await this.habitRepo.getActiveSchedules(userId);
    const due = schedulesForWeekday(schedules, now.getDay());
    const missing = missingScheduleBlocks(due, existing);

    if (missing.length === 0) return existing;

    await this.planRepo.insertMaterialized(userId, planDate, missing);
    return this.planRepo.getByDate(userId, planDate);
  }

  /**
   * Today's actionable habits as schedule-shaped rows for the reminder/coaching
   * path, plus the set of habit-types deliberately skipped today. A done/skipped/
   * moved block is reflected here, so reminders respect plan edits; for an unedited
   * plan the rows equal the template's schedules for today (reminder parity).
   */
  async getReminderSchedules(
    userId: string,
    now: Date = new Date()
  ): Promise<{ schedules: HabitScheduleWithNames[]; skipped: Set<string> }> {
    const [blocks, raw] = await Promise.all([
      this.getTodayPlan(userId, now),
      this.habitRepo.getActiveSchedules(userId),
    ]);
    const byId = new Map(raw.map(s => [s.id, s]));
    return { schedules: planBlocksToSchedules(blocks, byId, now), skipped: skippedTypeIds(blocks) };
  }

  /** Today's planned-vs-actual outcome (done / missed / skipped) for scoring & the brief. */
  async getDayOutcomes(userId: string, now: Date = new Date()): Promise<DayOutcomes> {
    const [blocks, raw] = await Promise.all([
      this.planRepo.getByDate(userId, localDateStr(now)),
      this.habitRepo.getActiveSchedules(userId),
    ]);
    return computeDayOutcomes(blocks, new Map(raw.map(s => [s.id, s])), now);
  }

  // ── AI propose-&-confirm ─────────────────────────────────────────────────────

  /**
   * Draft a recovery plan: write one 'proposed' catch-up block per habit missed so
   * far today (replacing any earlier draft for the day) and return them. Proposed
   * blocks are inert — reminders and scoring ignore them — until the user accepts.
   * Returns [] when nothing is missed.
   */
  async proposeDay(userId: string, now: Date = new Date()): Promise<PlanBlock[]> {
    const planDate = localDateStr(now);
    const [blocks, raw] = await Promise.all([
      this.getTodayPlan(userId, now),
      this.habitRepo.getActiveSchedules(userId),
    ]);
    const drafts = draftCatchupBlocks(blocks, new Map(raw.map(s => [s.id, s])), now);
    await this.planRepo.deleteProposed(userId, planDate); // clear any stale draft first
    if (drafts.length > 0) await this.planRepo.insertMaterialized(userId, planDate, drafts);
    return (await this.planRepo.getByDate(userId, planDate)).filter(b => b.status === 'proposed');
  }

  /** Today's proposed (unconfirmed) blocks, if any. */
  async getProposed(userId: string, now: Date = new Date()): Promise<PlanBlock[]> {
    const blocks = await this.planRepo.getByDate(userId, localDateStr(now));
    return blocks.filter(b => b.status === 'proposed');
  }

  /** Accept today's proposal: promote every proposed block to planned. Returns the count. */
  async acceptProposed(userId: string, now: Date = new Date()): Promise<number> {
    return this.planRepo.promoteProposed(userId, localDateStr(now));
  }

  /** Reject today's proposal: discard every proposed block. Returns the count. */
  async rejectProposed(userId: string, now: Date = new Date()): Promise<number> {
    return this.planRepo.deleteProposed(userId, localDateStr(now));
  }

  // ── Edits ──────────────────────────────────────────────────────────────────

  /** Move a block to a new start time (status → 'moved'). */
  async moveBlock(id: string, startTime: string): Promise<PlanBlock | null> {
    return this.planRepo.updateStartTime(id, startTime);
  }

  /** Skip a block for the day (status → 'skipped'); never counts as a miss. */
  async skipBlock(id: string): Promise<PlanBlock | null> {
    return this.planRepo.setStatus(id, 'skipped');
  }

  /** Push a block's start time forward by `minutes` (status → 'moved'). */
  async snoozeBlock(id: string, minutes: number): Promise<PlanBlock | null> {
    const block = await this.planRepo.getById(id);
    if (!block) return null;
    return this.planRepo.updateStartTime(id, minutesToClock(timeToMinutes(block.start_time) + minutes));
  }

  /**
   * Add a one-off block to today. A title that matches an existing habit-type is
   * linked to it; anything else is stored as a one-off with no habit-type, so a
   * throwaway block ("call mom") never pollutes the habit taxonomy.
   */
  async addAdhoc(
    userId: string,
    title: string,
    at: string | null,
    durationStr: string | null,
    now: Date = new Date()
  ): Promise<PlanBlock> {
    const durationMinutes = durationStr ? parseDurationToMinutes(durationStr) : null;
    const existing = await this.habitRepo.findHabitTypeByName(userId, title);
    return this.planRepo.insertAdhoc(userId, localDateStr(now), {
      habitTypeId: existing?.id ?? null,
      title: existing?.name ?? title,
      startTime: at ?? minutesToClock(nowMinutes(now)),
      durationMinutes,
      hardness: 'soft',
      sourceScheduleId: null,
    });
  }

  /**
   * Mark the plan block satisfied by a just-completed habit mission, binding the
   * mission. No-op when the mission has no habit-type or no block matches.
   */
  async markDoneForMission(mission: Mission, now: Date = new Date()): Promise<PlanBlock | null> {
    if (!mission.habit_type_id) return null;
    const blocks = await this.planRepo.getByDate(mission.user_id, localDateStr(now));
    const block = matchBlockForCompletion(blocks, mission.habit_type_id, now);
    if (!block) return null;
    return this.planRepo.markDone(block.id, mission.id);
  }

  /**
   * The block's planned length in minutes. Materialized blocks carry no duration
   * of their own (the template stores only a time), so fall back to the source
   * schedule's `grace_minutes` — which doubles as that block's planned window.
   * Returns null for a one-off block with no stated duration. An edited/ad-hoc
   * duration on the block always wins, keeping this adaptive.
   */
  async plannedMinutesForBlock(block: PlanBlock): Promise<number | null> {
    if (block.duration_minutes != null) return block.duration_minutes;
    if (!block.source_schedule_id) return null;
    const schedules = await this.habitRepo.getActiveSchedules(block.user_id);
    return schedules.find(s => s.id === block.source_schedule_id)?.grace_minutes ?? null;
  }

  /** Parse a natural-language edit, resolve its target in today's plan, apply it. */
  async applyEdit(userId: string, text: string, now: Date = new Date()): Promise<PlanEditOutcome> {
    const intent = parsePlanEdit(text);
    if (!intent) {
      return { ok: false, message: 'Plan command not recognized. Try: geser / skip / tambah / tunda.' };
    }
    const blocks = await this.getTodayPlan(userId, now);

    switch (intent.kind) {
      case 'move': {
        const block = resolveTargetBlock(blocks, intent.target);
        if (!block) return { ok: false, message: `No plan block matching "${intent.target}".` };
        const updated = await this.moveBlock(block.id, intent.at);
        return { ok: true, block: updated ?? undefined, message: `Moved ${block.title} → ${intent.at}.` };
      }
      case 'skip': {
        const block = resolveTargetBlock(blocks, intent.target);
        if (!block) return { ok: false, message: `No plan block matching "${intent.target}".` };
        const updated = await this.skipBlock(block.id);
        return { ok: true, block: updated ?? undefined, message: `Skipped ${block.title} for today.` };
      }
      case 'snooze': {
        const block = intent.target ? resolveTargetBlock(blocks, intent.target) : nearestOpenBlock(blocks, now);
        if (!block) return { ok: false, message: 'No open block to snooze.' };
        const updated = await this.snoozeBlock(block.id, intent.minutes);
        const at = updated?.start_time.slice(0, 5) ?? '';
        return { ok: true, block: updated ?? undefined, message: `Snoozed ${block.title} by ${intent.minutes}m → ${at}.` };
      }
      case 'add': {
        const block = await this.addAdhoc(userId, intent.title, intent.at, intent.durationStr, now);
        return { ok: true, block, message: `Added ${block.title} at ${block.start_time.slice(0, 5)}.` };
      }
      case 'accept': {
        const n = await this.acceptProposed(userId, now);
        return n > 0
          ? { ok: true, message: `Locked in ${n} proposed block(s).` }
          : { ok: false, message: 'No proposed plan to accept.' };
      }
      case 'reject': {
        const n = await this.rejectProposed(userId, now);
        return n > 0
          ? { ok: true, message: 'Discarded the proposed plan.' }
          : { ok: false, message: 'No proposed plan to reject.' };
      }
    }
  }
}
