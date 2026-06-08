import 'dotenv/config';
import { pool } from '../db/connection';
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
  /** Day of week: 0 = Sunday … 6 = Saturday. */
  dow: number;
  category: string;
  type: string;
  /** Expected time of day, 'HH:MM'. */
  at: string;
  /** Minutes after `at` before the habit counts as missed. */
  grace: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// One distinct habit per weekday.
const SCHEDULE: ScheduleEntry[] = [
  { dow: 1, category: 'Exercise', type: 'run', at: '06:00', grace: 90 },
  { dow: 2, category: 'Tennis', type: 'serve', at: '17:00', grace: 120 },
  { dow: 3, category: 'Learning', type: 'reading', at: '20:00', grace: 90 },
  { dow: 4, category: 'Tennis', type: 'footwork', at: '17:00', grace: 120 },
  { dow: 5, category: 'Mindfulness', type: 'meditation', at: '07:00', grace: 60 },
  { dow: 6, category: 'Exercise', type: 'strength', at: '18:00', grace: 120 },
  { dow: 0, category: 'Learning', type: 'course', at: '21:00', grace: 90 },
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

  // Process Mon→Sun for readable output.
  const ordered = [...SCHEDULE].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7));

  for (const e of ordered) {
    const categoryId = await ensureCategory(e.category);
    const habitTypeId = await ensureHabitType(categoryId, e.type);

    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id FROM habit_schedules
       WHERE user_id = $1 AND habit_type_id = $2 AND active = TRUE
         AND days_of_week @> $3::smallint[]
       LIMIT 1`,
      [DEFAULT_USER_ID, habitTypeId, [e.dow]]
    );
    if (existing.length > 0) {
      console.log(`  skip   ${DAY_NAMES[e.dow]}  ${e.category} · ${e.type}`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO habit_schedules (user_id, habit_type_id, expected_at, days_of_week, grace_minutes)
       VALUES ($1, $2, $3, $4::smallint[], $5)`,
      [DEFAULT_USER_ID, habitTypeId, e.at, [e.dow], e.grace]
    );
    console.log(`  insert ${DAY_NAMES[e.dow]}  ${e.at}  ${e.category} · ${e.type}  (grace ${e.grace}m)`);
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
