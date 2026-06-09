import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService, ProgressResult } from './GoalService';
import { Mission } from '../types';
import { parseDurationToMinutes } from '../utils/duration';
import { Queue } from 'bullmq';
import { redisConnection } from '../db/connection';

export interface MissionCompleteResult {
  mission: Mission;
  goalProgress: ProgressResult | null;
}

export interface MissionStartResult {
  mission: Mission;
  /** The previously-active mission that was put on hold to make room, if any. */
  heldMission: Mission | null;
}

/**
 * Thrown when an abort cannot pick a single mission — either the target is
 * ambiguous or there are multiple held missions and no target. Carries the
 * candidate missions so the caller can ask the user which one to cancel.
 */
export class AbortNeedsTargetError extends Error {
  constructor(
    public readonly candidates: Mission[],
    message = 'Multiple missions could be aborted — specify which one.'
  ) {
    super(message);
    this.name = 'AbortNeedsTargetError';
  }
}

export interface RetroactiveLogResult {
  mission: Mission;
  /** Progress on the goal tied to this specific habit type, if one is active. */
  habitGoalProgress: ProgressResult | null;
  /** Progress on the category-level (aggregate) goal, if one is active. */
  goalProgress: ProgressResult | null;
}

export class MissionService {
  private etaQueue: Queue;

  constructor(
    private missionRepo: MissionRepository,
    private goalRepo: GoalRepository,
    private habitRepo: HabitRepository,
    private goalService: GoalService
  ) {
    this.etaQueue = new Queue('eta-expiry', { connection: redisConnection });
  }

  async start(
    userId: string,
    title: string,
    etaStr: string | null,
    categoryName: string | null
  ): Promise<MissionStartResult> {
    // Resolve inputs that can fail *before* touching any existing mission, so a
    // bad category/duration never leaves the user with a held-but-no-active state.
    let habitCategoryId: string | null = null;
    if (categoryName) {
      const category = await this.habitRepo.getCategoryByName(userId, categoryName);
      if (!category) {
        throw new Error(`Category "${categoryName}" not found. Create it first with /habit category add.`);
      }
      habitCategoryId = category.id;
    }
    const etaMinutes = etaStr ? parseDurationToMinutes(etaStr) : null;

    // A mission is already live — put it on hold instead of rejecting the new
    // one. Its ETA timer is cancelled while paused; the user is reminded of it.
    let heldMission: Mission | null = null;
    const existing = await this.missionRepo.getActive(userId);
    if (existing) {
      await this.etaQueue.remove(`eta-${existing.id}`).catch(() => null);
      heldMission = await this.missionRepo.updateStatus(existing.id, 'paused');
    }

    const mission = await this.missionRepo.create(userId, title, habitCategoryId, etaMinutes);

    if (etaMinutes) {
      await this.etaQueue.add(
        'expire',
        { missionId: mission.id },
        { delay: etaMinutes * 60 * 1000, jobId: `eta-${mission.id}` }
      );
    }

    return { mission, heldMission };
  }

  async complete(
    userId: string,
    actualDurationStr: string | null,
    notes: string | null
  ): Promise<MissionCompleteResult> {
    const mission = await this.missionRepo.getActive(userId);
    if (!mission) throw new Error('No active mission to complete.');

    const startedAt = mission.started_at ? new Date(mission.started_at) : new Date();
    const elapsedMinutes = Math.round((Date.now() - startedAt.getTime()) / 60000);
    const actualDuration = actualDurationStr
      ? parseDurationToMinutes(actualDurationStr)
      : elapsedMinutes;

    await this.etaQueue.remove(`eta-${mission.id}`).catch(() => null);

    const completed = await this.missionRepo.updateStatus(mission.id, 'completed', {
      actual_duration_minutes: actualDuration,
      notes: notes ?? undefined,
    });

    const { goalProgress } = await this.advanceGoals(mission, actualDuration);
    return { mission: completed, goalProgress };
  }

  /**
   * Record an activity that already happened (no live timer was running) as a
   * 'retroactive', already-completed mission, then advance any goals it feeds.
   */
  async logRetroactive(
    userId: string,
    categoryName: string,
    habitTypeName: string,
    durationStr: string,
    note: string | null
  ): Promise<RetroactiveLogResult> {
    const category = await this.habitRepo.getCategoryByName(userId, categoryName);
    if (!category) throw new Error(`Category "${categoryName}" not found.`);

    const habitType = await this.habitRepo.upsertHabitType(category.id, habitTypeName);
    const durationMinutes = parseDurationToMinutes(durationStr);
    const mission = await this.missionRepo.createRetroactive(
      userId,
      habitTypeName,
      category.id,
      habitType.id,
      durationMinutes,
      note
    );

    const { habitGoalProgress, goalProgress } = await this.advanceGoals(mission, durationMinutes);
    return { mission, habitGoalProgress, goalProgress };
  }

  /**
   * Advance the goal tied to this mission's habit type (e.g. a "running" goal) and
   * the broader category-level goal, if either is active.
   */
  private async advanceGoals(
    mission: Mission,
    durationMinutes: number
  ): Promise<{ habitGoalProgress: ProgressResult | null; goalProgress: ProgressResult | null }> {
    let habitGoalProgress: ProgressResult | null = null;
    if (mission.habit_type_id) {
      const habitGoal = await this.goalRepo.getActiveByHabitType(mission.habit_type_id);
      if (habitGoal) {
        habitGoalProgress = await this.goalService.logProgress(
          habitGoal.id,
          durationMinutes,
          'minutes',
          mission.id
        );
      }
    }

    let goalProgress: ProgressResult | null = null;
    if (mission.habit_category_id) {
      const goal = await this.goalRepo.getActiveByCategory(mission.habit_category_id);
      if (goal) {
        goalProgress = await this.goalService.logProgress(
          goal.id,
          durationMinutes,
          'minutes',
          mission.id
        );
      }
    }

    return { habitGoalProgress, goalProgress };
  }

  /**
   * Cancel a mission (mark it `failed`). With a `target` title fragment, cancels
   * the matching active/held mission. Without one, cancels the active mission, or
   * the single held mission when none is active. Throws AbortNeedsTargetError when
   * the choice is ambiguous (target matches several, or several held and none active).
   */
  async abort(userId: string, target?: string | null): Promise<Mission> {
    const [active, held] = await Promise.all([
      this.missionRepo.getActive(userId),
      this.missionRepo.getHeld(userId),
    ]);

    const cancel = async (m: Mission): Promise<Mission> => {
      await this.etaQueue.remove(`eta-${m.id}`).catch(() => null);
      return this.missionRepo.updateStatus(m.id, 'failed');
    };

    const fragment = target?.trim().toLowerCase();
    if (fragment) {
      const candidates = [...(active ? [active] : []), ...held];
      const matches = candidates.filter(m => m.title.toLowerCase().includes(fragment));
      if (matches.length === 0) throw new Error(`No active or held mission matching "${target!.trim()}" to abort.`);
      if (matches.length > 1) {
        throw new AbortNeedsTargetError(matches, `More than one mission matches "${target!.trim()}" — name it more precisely.`);
      }
      return cancel(matches[0]);
    }

    if (active) return cancel(active);
    if (held.length === 1) return cancel(held[0]);
    if (held.length > 1) throw new AbortNeedsTargetError(held);
    throw new Error('No active or held mission to abort.');
  }

  async extend(userId: string, additionalStr: string): Promise<Mission> {
    const mission = await this.missionRepo.getActive(userId);
    if (!mission) throw new Error('No active mission to extend.');
    const extra = parseDurationToMinutes(additionalStr);
    const updated = await this.missionRepo.extendEta(mission.id, extra);
    const startedAt = mission.started_at ? new Date(mission.started_at) : new Date();
    const newEta = (updated.eta_minutes ?? 0) * 60 * 1000;
    const remaining = startedAt.getTime() + newEta - Date.now();
    if (remaining > 0) {
      await this.etaQueue.remove(`eta-${mission.id}`).catch(() => null);
      await this.etaQueue.add(
        'expire',
        { missionId: mission.id },
        { delay: remaining, jobId: `eta-${mission.id}` }
      );
    }
    return updated;
  }

  async getActiveMission(userId: string): Promise<Mission | null> {
    return this.missionRepo.getActive(userId);
  }

  /** Missions put on hold by a later `start`, most-recently-held first. */
  async getHeldMissions(userId: string): Promise<Mission[]> {
    return this.missionRepo.getHeld(userId);
  }

  /** The mission currently waiting for a "what did you do?" reply, if any. */
  async getMissionAwaitingNotes(userId: string): Promise<Mission | null> {
    return this.missionRepo.getAwaitingNotes(userId);
  }

  /** Flag a mission to ask the user what they did (captured into notes next). */
  async requestNotes(missionId: string): Promise<void> {
    await this.missionRepo.setAwaitingNotes(missionId, true);
  }

  /** Stop waiting for notes without recording any (user moved on). */
  async clearNotesRequest(missionId: string): Promise<void> {
    await this.missionRepo.setAwaitingNotes(missionId, false);
  }

  /** Record the user's reply into the mission's notes and clear the flag. */
  async recordNotes(missionId: string, notes: string): Promise<Mission> {
    return this.missionRepo.appendNotes(missionId, notes);
  }

  /**
   * Resolve an ETA-expired mission from the user's reply: set the final status
   * (completed or failed/not-completed) with notes, clear the notes flag, and —
   * when completed — advance any linked goals using the elapsed duration.
   */
  async resolveExpiredMission(
    missionId: string,
    completed: boolean,
    notes: string
  ): Promise<MissionCompleteResult> {
    const mission = await this.missionRepo.getById(missionId);
    if (!mission) throw new Error('Mission not found.');

    if (!completed) {
      const failed = await this.missionRepo.updateStatus(missionId, 'failed', { notes });
      await this.missionRepo.setAwaitingNotes(missionId, false);
      return { mission: failed, goalProgress: null };
    }

    const startedAt = mission.started_at ? new Date(mission.started_at) : new Date();
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
    const updated = await this.missionRepo.updateStatus(missionId, 'completed', {
      actual_duration_minutes: elapsed,
      notes,
    });
    await this.missionRepo.setAwaitingNotes(missionId, false);

    const { goalProgress } = await this.advanceGoals(updated, elapsed);
    return { mission: updated, goalProgress };
  }

  async getRecentCompleted(userId: string, days = 7): Promise<Mission[]> {
    return this.missionRepo.getRecentCompleted(userId, days);
  }
}
