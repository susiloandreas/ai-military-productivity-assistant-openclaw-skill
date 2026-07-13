import { HabitScheduleWithNames, PlanBlock } from '../types';
import type { NewPlanBlock } from '../repositories/PlanRepository';

/**
 * Pure helpers for plan editing and done-matching — no DB or clock access, so
 * each rule is unit-testable (mirroring planMaterialize / streakMath).
 */

/** Statuses a block can still be acted on (moved, skipped, completed). */
const OPEN_STATUSES: PlanBlock['status'][] = ['planned', 'moved'];

/** Statuses a reminder/score should still act on (a moved block keeps its new time). */
const ACTIONABLE_STATUSES: PlanBlock['status'][] = ['planned', 'moved'];

/** Window fallback when a block has neither a duration nor a source-schedule grace. */
const DEFAULT_GRACE_MIN = 90;

/** 'HH:MM[:SS]' → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Minutes since midnight → 'HH:MM', clamped to a single day. */
export function minutesToClock(min: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

/** Local wall-clock minutes since midnight for `now`. */
export function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Resolve a free-text target ("lari", "english") to one block by title: an exact
 * (case-insensitive) match first, else a unique substring match. Returns null
 * when nothing matches or the match is ambiguous (several distinct blocks).
 */
export function resolveTargetBlock(blocks: PlanBlock[], target: string): PlanBlock | null {
  const t = target.trim().toLowerCase();
  if (!t) return null;
  const exact = blocks.filter(b => b.title.toLowerCase() === t);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const sub = blocks.filter(b => b.title.toLowerCase().includes(t));
  return sub.length === 1 ? sub[0] : null;
}

/** The still-open block whose start time is closest to `now` — the bare-"tunda" target. */
export function nearestOpenBlock(blocks: PlanBlock[], now: Date): PlanBlock | null {
  const open = blocks.filter(b => OPEN_STATUSES.includes(b.status));
  if (open.length === 0) return null;
  const n = nowMinutes(now);
  return open.reduce((best, b) =>
    Math.abs(timeToMinutes(b.start_time) - n) < Math.abs(timeToMinutes(best.start_time) - n) ? b : best
  );
}

/**
 * The next still-open block starting after `now` (earliest first) — drives the
 * "what's next" nudge after a mission closes, so the operator is pointed at the
 * next scheduled task instead of going idle. Null once nothing is left today.
 */
export function nextUpcomingBlock(blocks: PlanBlock[], now: Date): PlanBlock | null {
  const n = nowMinutes(now);
  const upcoming = blocks
    .filter(b => OPEN_STATUSES.includes(b.status) && timeToMinutes(b.start_time) > n)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  return upcoming[0] ?? null;
}

// Completion window: a log may land a little before the block, and up to its
// duration (or a default, since materialized blocks carry none) after. The
// bounds stop a far-off log from marking a block done.
const EARLY_GRACE_MIN = 60;
const DEFAULT_WINDOW_MIN = 240;

/**
 * The open block of `habitTypeId` whose completion window contains `now`,
 * nearest start first. Other types, and done/skipped blocks, are ignored; a log
 * far from every block returns null. With two same-type blocks, the nearer wins.
 */
export function matchBlockForCompletion(
  blocks: PlanBlock[],
  habitTypeId: string,
  now: Date
): PlanBlock | null {
  const n = nowMinutes(now);
  const inWindow = blocks
    .filter(b => b.habit_type_id === habitTypeId && OPEN_STATUSES.includes(b.status))
    .filter(b => {
      const start = timeToMinutes(b.start_time);
      const end = start + (b.duration_minutes ?? DEFAULT_WINDOW_MIN);
      return n >= start - EARLY_GRACE_MIN && n <= end;
    });
  if (inWindow.length === 0) return null;
  return inWindow.reduce((best, b) =>
    Math.abs(timeToMinutes(b.start_time) - n) < Math.abs(timeToMinutes(best.start_time) - n) ? b : best
  );
}

/**
 * Adapt today's actionable plan blocks into the `HabitScheduleWithNames` shape the
 * reminder/coaching functions already consume, so all the existing due/missed
 * logic applies unchanged. A moved block carries its new start time; done,
 * skipped, proposed, and one-off (typeless) blocks are excluded. Grace and
 * category come from the block's source schedule (`scheduleById`). For an
 * unedited plan this reproduces the template's schedules for today exactly, which
 * is what preserves reminder parity.
 */
export function planBlocksToSchedules(
  blocks: PlanBlock[],
  scheduleById: Map<string, HabitScheduleWithNames>,
  now: Date
): HabitScheduleWithNames[] {
  const weekday = now.getDay();
  const out: HabitScheduleWithNames[] = [];
  for (const b of blocks) {
    if (!b.habit_type_id || !ACTIONABLE_STATUSES.includes(b.status)) continue;
    const src = b.source_schedule_id ? scheduleById.get(b.source_schedule_id) : undefined;
    out.push({
      id: b.source_schedule_id ?? b.id,
      habit_type_id: b.habit_type_id,
      user_id: b.user_id,
      expected_at: b.start_time,
      grace_minutes: src?.grace_minutes ?? DEFAULT_GRACE_MIN,
      days_of_week: [weekday], // already today's plan
      active: true,
      created_at: b.created_at,
      habit_type_name: b.title,
      category_name: src?.category_name ?? '—',
    });
  }
  return out;
}

/** The habit-type ids of today's deliberately-skipped blocks. */
export function skippedTypeIds(blocks: PlanBlock[]): Set<string> {
  return new Set(
    blocks.filter(b => b.status === 'skipped' && b.habit_type_id).map(b => b.habit_type_id as string)
  );
}

/** Per-day planned-vs-actual outcome counts/names for discipline scoring & the brief. */
export interface DayOutcomes {
  done: string[];
  missed: string[];
  skipped: string[];
  /** Actionable + done + skipped blocks (everything except 'proposed'). */
  planned: number;
}

/**
 * Classify today's blocks into done / missed / skipped. A `planned` or `moved`
 * block whose window has closed with no completion counts as missed; `skipped` is
 * a deliberate choice (never a miss); `proposed` blocks are ignored entirely.
 */
export function computeDayOutcomes(
  blocks: PlanBlock[],
  scheduleById: Map<string, HabitScheduleWithNames>,
  now: Date
): DayOutcomes {
  const n = nowMinutes(now);
  const done: string[] = [];
  const missed: string[] = [];
  const skipped: string[] = [];
  for (const b of blocks) {
    if (b.status === 'proposed') continue;
    if (b.status === 'done') { done.push(b.title); continue; }
    if (b.status === 'skipped') { skipped.push(b.title); continue; }
    if (n > blockWindowEnd(b, scheduleById)) missed.push(b.title);
  }
  return { done, missed, skipped, planned: blocks.filter(b => b.status !== 'proposed').length };
}

/** End of a block's window (minutes since midnight): start + duration, or + the source grace. */
function blockWindowEnd(b: PlanBlock, scheduleById: Map<string, HabitScheduleWithNames>): number {
  const grace = (b.source_schedule_id ? scheduleById.get(b.source_schedule_id)?.grace_minutes : undefined) ?? DEFAULT_GRACE_MIN;
  return timeToMinutes(b.start_time) + (b.duration_minutes ?? grace);
}

const PROPOSAL_STAGGER_MIN = 45;

/**
 * A propose-&-confirm draft: one 'proposed' catch-up block per habit missed so
 * far today, staggered at 45-min gaps from the next half hour. Returns [] when
 * nothing is missed. Pure — the caller persists the blocks and asks the user to
 * accept. Proposed blocks are inert until accepted (reminders/scoring skip them).
 */
export function draftCatchupBlocks(
  blocks: PlanBlock[],
  scheduleById: Map<string, HabitScheduleWithNames>,
  now: Date
): NewPlanBlock[] {
  const n = nowMinutes(now);
  const missed = blocks.filter(
    b => b.habit_type_id && ACTIONABLE_STATUSES.includes(b.status) && n > blockWindowEnd(b, scheduleById)
  );
  let slot = Math.ceil((n + 15) / 30) * 30;
  return missed.map(b => {
    const startTime = minutesToClock(slot);
    slot = Math.min(slot + PROPOSAL_STAGGER_MIN, 23 * 60 + 59);
    return {
      habitTypeId: b.habit_type_id,
      title: b.title,
      startTime,
      durationMinutes: b.duration_minutes,
      hardness: 'soft' as const,
      sourceScheduleId: null,
      status: 'proposed' as const,
    };
  });
}
