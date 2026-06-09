import 'dotenv/config';
import { pool } from '../db/connection';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService } from '../services/GoalService';
import { DEFAULT_USER_ID } from '../types';

/**
 * Seed category-level goals, each with an HOUR-based duration target that must
 * be met. The target is a final-exam milestone at `hours * 60` minutes (the
 * system tracks progress in minutes), with a couple of intermediate hour
 * milestones along the way. Any logged mission in the category auto-advances
 * its goal, so completing missions moves these toward their hour target.
 *
 * After creating each goal, existing retroactive minutes already logged in that
 * category are backfilled as progress, so the goal reflects the seeded week.
 *
 * Idempotent: a category is skipped if it already has an active goal.
 *
 *   npm run seed:goals        # against $DATABASE_URL
 */

interface GoalDef {
  category: string;
  /** Final target, in hours, that must be met. */
  hours: number;
  /** Intermediate milestone checkpoints, in hours (< hours). */
  checkpointsH: number[];
}

const GOALS: GoalDef[] = [
  { category: 'Tennis', hours: 50, checkpointsH: [10, 25] },
  { category: 'Learning', hours: 40, checkpointsH: [10, 20] },
  { category: 'Exercise', hours: 30, checkpointsH: [10, 20] },
  { category: 'Mindfulness', hours: 10, checkpointsH: [3, 6] },
];

const goalRepo = new GoalRepository();
const habitRepo = new HabitRepository();
const goalService = new GoalService(goalRepo, habitRepo);

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

/** Total minutes already logged (retroactively) under a category. */
async function loggedMinutes(categoryId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(actual_duration_minutes), 0) AS total
     FROM missions
     WHERE user_id = $1 AND habit_category_id = $2 AND mode = 'retroactive'`,
    [DEFAULT_USER_ID, categoryId]
  );
  return Number(rows[0].total);
}

async function seed(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const g of GOALS) {
    const categoryId = await ensureCategory(g.category);

    if (await goalRepo.getActiveByCategory(categoryId)) {
      console.log(`  skip   ${g.category} — active goal already exists`);
      skipped++;
      continue;
    }

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 90);

    const goal = await goalRepo.create(
      DEFAULT_USER_ID,
      categoryId,
      `Kuasai ${g.category} — ${g.hours} jam`,
      `Akumulasi ${g.hours} jam latihan terlatih di kategori ${g.category}.`,
      deadline,
      null,
      g.hours
    );

    // Intermediate hour checkpoints + the final-exam hour target.
    for (const h of g.checkpointsH) {
      await goalRepo.addMilestone(goal.id, `${h} jam`, h * 60, 'minutes', false);
    }
    await goalRepo.addMilestone(goal.id, `${g.hours} jam (ujian akhir)`, g.hours * 60, 'minutes', true);

    // Backfill progress from minutes already logged this week in the category.
    const minutes = await loggedMinutes(categoryId);
    let progressNote = 'no prior logs';
    if (minutes > 0) {
      const result = await goalService.logProgress(goal.id, minutes, 'minutes', null);
      progressNote = `backfilled ${minutes}m (${(minutes / 60).toFixed(1)}h / ${g.hours}h)` +
        (result.milestonesUnlocked.length ? `, unlocked ${result.milestonesUnlocked.length} milestone(s)` : '');
    }

    console.log(`  create ${g.category} — target ${g.hours}h, checkpoints ${g.checkpointsH.join('h, ')}h; ${progressNote}`);
    created++;
  }

  console.log(`\nGoal seed complete — ${created} created, ${skipped} skipped.`);
  await pool.end();
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Goal seed failed:', err);
    process.exit(1);
  });
