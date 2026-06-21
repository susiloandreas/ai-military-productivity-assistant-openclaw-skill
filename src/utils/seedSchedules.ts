import 'dotenv/config';
import { pool } from '../db/connection';
import { formatDaysOfWeek } from './schedule';
import { DEFAULT_USER_ID } from '../types';

/**
 * Seed a weekly habit schedule where every day of the week expects a *different*
 * habit. Each schedule targets a single weekday, so the idle-reminder /
 * loss-aversion nudge has a distinct target to track each day.
 *
 * Idempotent: a day is skipped if an active schedule for that habit type already
 * covers that weekday, so re-running is safe.
 *
 *   npm run seed:schedules        # against $DATABASE_URL
 *
 * Edit SCHEDULE below to change the per-day plan.
 */

interface ScheduleEntry {
  /** Days of week this habit recurs on: 0 = Sunday … 6 = Saturday. */
  days: number[];
  category: string;
  type: string;
  /** Expected start time of day, 'HH:MM'. */
  at: string;
  /**
   * Minutes after `at` before the habit counts as missed. `habit_schedules`
   * has no duration column, so here `grace` doubles as the block's planned
   * duration window (e.g. 5h parkee → 300).
   */
  grace: number;
}

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

// Weekday plan (Mon–Fri), ordered by start time. `grace` carries each block's
// intended duration since habit_schedules tracks no duration of its own.
//
// NOTE: every schedule nags within its grace window — there is no "soft/buffer"
// concept in the current schema. The lunch block is included as a placeholder so
// the day has an explicit, protected break; drop it (or set grace low) if you do
// not want a lunch reminder. A true non-nagging buffer needs the add-adaptive-
// daily-plan change (plan_blocks.hardness = 'soft').
const SCHEDULE: ScheduleEntry[] = [
  { days: WEEKDAYS, category: 'Mindfulness',   type: 'saat teduh',      at: '05:00', grace: 30 },  // subuh
  { days: WEEKDAYS, category: 'Exercise',      type: 'workout',         at: '07:30', grace: 60 },  // 1h
  { days: WEEKDAYS, category: 'Finance',       type: 'trading',         at: '08:45', grace: 15 },
  { days: WEEKDAYS, category: 'Work',          type: 'parkee',          at: '09:00', grace: 300 }, // 5h, workhours
  { days: WEEKDAYS, category: 'Buffer',        type: 'lunch',           at: '12:00', grace: 60 },  // protected break
  { days: WEEKDAYS, category: 'Work',          type: 'sapa',            at: '14:00', grace: 180 }, // 3h, workhours
  { days: WEEKDAYS, category: 'Sidejob',       type: 'iemfit',          at: '18:00', grace: 60 },  // after 6 PM
  { days: WEEKDAYS, category: 'Communication', type: 'public speaking', at: '20:00', grace: 30 },  // night
  { days: WEEKDAYS, category: 'Learning',      type: 'english writing', at: '20:30', grace: 30 },  // night
];

async function ensureCategory(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO habit_categories (user_id, name)
     VALUES ($1, $2)
     ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [DEFAULT_USER_ID, name]
  );
  return rows[0].id;
}

async function ensureHabitType(categoryId: string, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO habit_types (habit_category_id, name, unit)
     VALUES ($1, $2, 'minutes')
     ON CONFLICT (habit_category_id, name) DO UPDATE SET unit = EXCLUDED.unit
     RETURNING id`,
    [categoryId, name]
  );
  return rows[0].id;
}

async function seed(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  // Process in start-time order for readable output.
  const ordered = [...SCHEDULE].sort((a, b) => a.at.localeCompare(b.at));

  for (const e of ordered) {
    const categoryId = await ensureCategory(e.category);
    const habitTypeId = await ensureHabitType(categoryId, e.type);

    // Skip if an active schedule for this habit type already covers any of
    // these days (&& = array overlap), so re-running is safe.
    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id FROM habit_schedules
       WHERE user_id = $1 AND habit_type_id = $2 AND active = TRUE
         AND days_of_week && $3::smallint[]
       LIMIT 1`,
      [DEFAULT_USER_ID, habitTypeId, e.days]
    );
    if (existing.length > 0) {
      console.log(`  skip   ${formatDaysOfWeek(e.days)}  ${e.category} · ${e.type}`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO habit_schedules (user_id, habit_type_id, expected_at, days_of_week, grace_minutes)
       VALUES ($1, $2, $3, $4::smallint[], $5)`,
      [DEFAULT_USER_ID, habitTypeId, e.at, e.days, e.grace]
    );
    console.log(`  insert ${e.at}  ${formatDaysOfWeek(e.days)}  ${e.category} · ${e.type}  (grace ${e.grace}m)`);
    inserted++;
  }

  console.log(`\nSchedule seed complete — ${inserted} inserted, ${skipped} skipped.`);
  await pool.end();
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Schedule seed failed:', err);
    process.exit(1);
  });
