import 'dotenv/config';
import { pool } from '../db/connection';
import { DEFAULT_USER_ID } from '../types';

/**
 * Seed one week of habit activity — a different completed activity each of the
 * last 7 days (today inclusive). Each entry is recorded as a *retroactive*,
 * already-completed mission so it counts toward `/habit summary`, category
 * totals, and discipline scoring exactly like a real logged activity.
 *
 * Idempotent: an activity is skipped if a retroactive mission for the same
 * habit type already exists on that calendar day, so re-running is safe.
 *
 *   npm run seed            # against $DATABASE_URL
 *
 * Edit WEEK below to change the activities, durations, or times.
 */

interface DayEntry {
  /** Days before today (0 = today, 6 = six days ago). */
  daysAgo: number;
  category: string;
  type: string;
  minutes: number;
  /** Hour of day (local) the activity was completed. */
  hour: number;
  note: string;
}

// index 0 → 6 days ago … last → today, so the week reads chronologically.
const WEEK: DayEntry[] = [
  { daysAgo: 6, category: 'Tennis', type: 'serve', minutes: 90, hour: 17, note: 'Serve drills' },
  { daysAgo: 5, category: 'Learning', type: 'reading', minutes: 60, hour: 20, note: 'Deep work reading' },
  { daysAgo: 4, category: 'Exercise', type: 'run', minutes: 45, hour: 6, note: 'Morning run' },
  { daysAgo: 3, category: 'Tennis', type: 'footwork', minutes: 60, hour: 17, note: 'Footwork ladder' },
  { daysAgo: 2, category: 'Mindfulness', type: 'meditation', minutes: 20, hour: 7, note: 'Breath focus' },
  { daysAgo: 1, category: 'Exercise', type: 'strength', minutes: 50, hour: 18, note: 'Full body' },
  { daysAgo: 0, category: 'Learning', type: 'course', minutes: 75, hour: 21, note: 'Online course' },
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

/** A Date at `hour:00` local time, `daysAgo` days before today. */
function dayAt(daysAgo: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function seed(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const e of WEEK) {
    const categoryId = await ensureCategory(e.category);
    const habitTypeId = await ensureHabitType(categoryId, e.type);
    const ts = dayAt(e.daysAgo, e.hour);

    // Skip if this habit type was already logged on that calendar day.
    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id FROM missions
       WHERE user_id = $1 AND habit_type_id = $2
         AND mode = 'retroactive'
         AND date(completed_at) = date($3)
       LIMIT 1`,
      [DEFAULT_USER_ID, habitTypeId, ts]
    );
    if (existing.length > 0) {
      console.log(`  skip   ${ts.toDateString()}  ${e.category} · ${e.type}`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO missions
         (user_id, title, habit_category_id, habit_type_id, status, mode,
          started_at, completed_at, actual_duration_minutes, notes, created_at)
       VALUES ($1, $2, $3, $4, 'completed', 'retroactive', $5, $5, $6, $7, $5)`,
      [DEFAULT_USER_ID, e.type, categoryId, habitTypeId, ts, e.minutes, e.note]
    );
    console.log(`  insert ${ts.toDateString()}  ${e.category} · ${e.type}  ${e.minutes}m`);
    inserted++;
  }

  console.log(`\nSeed complete — ${inserted} inserted, ${skipped} skipped.`);
  await pool.end();
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
