import { pool } from '../db/connection';
import { PlanBlock, PlanBlockHardness, PlanBlockStatus } from '../types';

/**
 * Input shape for inserting a plan block — either materialized from a habit
 * schedule or added ad-hoc. `startTime` accepts 'HH:MM' or 'HH:MM:SS'.
 */
export interface NewPlanBlock {
  habitTypeId: string | null;
  title: string;
  startTime: string;
  durationMinutes: number | null;
  hardness: PlanBlockHardness;
  sourceScheduleId: string | null;
  status?: PlanBlockStatus; // defaults to 'planned'
}

// pg TIME/DATE come back as strings via to_char, matching HabitSchedule.expected_at.
const COLS = `id, user_id, to_char(plan_date, 'YYYY-MM-DD') AS plan_date,
  habit_type_id, title, to_char(start_time, 'HH24:MI:SS') AS start_time,
  duration_minutes, hardness, status, source_schedule_id, completed_mission_id,
  created_at, updated_at`;

/**
 * Persistence for the adaptive daily plan. Thin SQL only — PlanService owns the
 * materialization and status logic.
 */
export class PlanRepository {
  /** A day's blocks for a user, earliest first. */
  async getByDate(userId: string, planDate: string): Promise<PlanBlock[]> {
    const { rows } = await pool.query<PlanBlock>(
      `SELECT ${COLS} FROM plan_blocks
        WHERE user_id = $1 AND plan_date = $2
        ORDER BY start_time, created_at`,
      [userId, planDate]
    );
    return rows;
  }

  /**
   * Bulk-insert materialized template blocks for a day. `ON CONFLICT DO NOTHING`
   * against the (user, day, source schedule) partial unique index makes a
   * concurrent double read idempotent — neither call double-inserts.
   */
  async insertMaterialized(userId: string, planDate: string, blocks: NewPlanBlock[]): Promise<void> {
    if (blocks.length === 0) return;
    const tuples: string[] = [];
    const params: unknown[] = [userId, planDate];
    for (const b of blocks) {
      const i = params.length;
      tuples.push(`($1, $2, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7})`);
      params.push(
        b.habitTypeId, b.title, b.startTime, b.durationMinutes,
        b.hardness, b.status ?? 'planned', b.sourceScheduleId
      );
    }
    await pool.query(
      `INSERT INTO plan_blocks
         (user_id, plan_date, habit_type_id, title, start_time, duration_minutes, hardness, status, source_schedule_id)
       VALUES ${tuples.join(', ')}
       ON CONFLICT DO NOTHING`,
      params
    );
  }

  /** Insert a single ad-hoc block (no template provenance), returning it. */
  async insertAdhoc(userId: string, planDate: string, block: NewPlanBlock): Promise<PlanBlock> {
    const { rows } = await pool.query<PlanBlock>(
      `INSERT INTO plan_blocks
         (user_id, plan_date, habit_type_id, title, start_time, duration_minutes, hardness, status, source_schedule_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
       RETURNING ${COLS}`,
      [userId, planDate, block.habitTypeId, block.title, block.startTime,
       block.durationMinutes, block.hardness, block.status ?? 'planned']
    );
    return rows[0];
  }

  async getById(id: string): Promise<PlanBlock | null> {
    const { rows } = await pool.query<PlanBlock>(`SELECT ${COLS} FROM plan_blocks WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Move/snooze: set a new start time and mark 'moved'. A done block is left alone. */
  async updateStartTime(id: string, startTime: string): Promise<PlanBlock | null> {
    const { rows } = await pool.query<PlanBlock>(
      `UPDATE plan_blocks SET start_time = $2, status = 'moved', updated_at = NOW()
        WHERE id = $1 AND status <> 'done' RETURNING ${COLS}`,
      [id, startTime]
    );
    return rows[0] ?? null;
  }

  /** Set a block's status (e.g. 'skipped' or promoting 'proposed' → 'planned'). A done block is not reopened. */
  async setStatus(id: string, status: PlanBlockStatus): Promise<PlanBlock | null> {
    const { rows } = await pool.query<PlanBlock>(
      `UPDATE plan_blocks SET status = $2, updated_at = NOW()
        WHERE id = $1 AND status <> 'done' RETURNING ${COLS}`,
      [id, status]
    );
    return rows[0] ?? null;
  }

  /** Bind the completing mission and mark the block done. */
  async markDone(id: string, missionId: string): Promise<PlanBlock | null> {
    const { rows } = await pool.query<PlanBlock>(
      `UPDATE plan_blocks SET status = 'done', completed_mission_id = $2, updated_at = NOW()
        WHERE id = $1 RETURNING ${COLS}`,
      [id, missionId]
    );
    return rows[0] ?? null;
  }

  /** Drop all proposed blocks for a day (reject flow / stale-proposal cleanup); returns how many. */
  async deleteProposed(userId: string, planDate: string): Promise<number> {
    const { rowCount } = await pool.query(
      `DELETE FROM plan_blocks WHERE user_id = $1 AND plan_date = $2 AND status = 'proposed'`,
      [userId, planDate]
    );
    return rowCount ?? 0;
  }

  /** Promote a day's proposed blocks to planned (accept flow); returns how many. */
  async promoteProposed(userId: string, planDate: string): Promise<number> {
    const { rowCount } = await pool.query(
      `UPDATE plan_blocks SET status = 'planned', updated_at = NOW()
        WHERE user_id = $1 AND plan_date = $2 AND status = 'proposed'`,
      [userId, planDate]
    );
    return rowCount ?? 0;
  }
}
