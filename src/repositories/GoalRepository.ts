import { pool } from '../db/connection';
import { Goal, GoalStatus, Milestone, GoalProgressLog } from '../types';

export class GoalRepository {
  // ── Goals ────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    habitCategoryId: string,
    title: string,
    targetDescription: string | null,
    deadline: Date | null,
    habitTypeId: string | null = null
  ): Promise<Goal> {
    const { rows } = await pool.query<Goal>(
      `INSERT INTO goals (user_id, habit_category_id, title, target_description, deadline, habit_type_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, habitCategoryId, title, targetDescription, deadline, habitTypeId]
    );
    return rows[0];
  }

  /** Active category-level goal (aggregates the whole category; not tied to a habit type). */
  async getActiveByCategory(habitCategoryId: string): Promise<Goal | null> {
    const { rows } = await pool.query<Goal>(
      `SELECT * FROM goals WHERE habit_category_id = $1 AND habit_type_id IS NULL AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [habitCategoryId]
    );
    return rows[0] ?? null;
  }

  /** Active goal targeting a specific habit type (e.g. a "running" goal). */
  async getActiveByHabitType(habitTypeId: string): Promise<Goal | null> {
    const { rows } = await pool.query<Goal>(
      `SELECT * FROM goals WHERE habit_type_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [habitTypeId]
    );
    return rows[0] ?? null;
  }

  async getById(id: string): Promise<Goal | null> {
    const { rows } = await pool.query<Goal>('SELECT * FROM goals WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async getAllActive(userId: string): Promise<Goal[]> {
    const { rows } = await pool.query<Goal>(
      `SELECT * FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at`,
      [userId]
    );
    return rows;
  }

  async updateStatus(id: string, status: GoalStatus): Promise<Goal> {
    const { rows } = await pool.query<Goal>(
      `UPDATE goals SET status = $2 WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return rows[0];
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async addMilestone(
    goalId: string,
    title: string,
    targetValue: number,
    unit: string,
    isFinalExam: boolean
  ): Promise<Milestone> {
    const { rows } = await pool.query<Milestone>(
      `INSERT INTO milestones (goal_id, title, target_value, unit, is_final_exam)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [goalId, title, targetValue, unit, isFinalExam]
    );
    return rows[0];
  }

  async getMilestones(goalId: string): Promise<Milestone[]> {
    const { rows } = await pool.query<Milestone>(
      `SELECT * FROM milestones WHERE goal_id = $1 ORDER BY target_value ASC`,
      [goalId]
    );
    return rows;
  }

  async achieveMilestone(id: string): Promise<Milestone> {
    const { rows } = await pool.query<Milestone>(
      `UPDATE milestones SET achieved_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0];
  }

  // ── Progress Logs ─────────────────────────────────────────────────────────

  async addProgressLog(
    goalId: string,
    valueDelta: number,
    unit: string,
    sourceMissionId: string | null,
    sourceHabitLogId: string | null
  ): Promise<GoalProgressLog> {
    const { rows } = await pool.query<GoalProgressLog>(
      `INSERT INTO goal_progress_logs
         (goal_id, value_delta, unit, source_mission_id, source_habit_log_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [goalId, valueDelta, unit, sourceMissionId, sourceHabitLogId]
    );
    return rows[0];
  }

  async getRecentProgressByUser(userId: string, days = 7): Promise<GoalProgressLog[]> {
    const { rows } = await pool.query<GoalProgressLog>(
      `SELECT gpl.*
       FROM goal_progress_logs gpl
       JOIN goals g ON g.id = gpl.goal_id
       WHERE g.user_id = $1 AND gpl.logged_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY gpl.logged_at DESC`,
      [userId, days]
    );
    return rows;
  }

  async getTotalProgress(goalId: string): Promise<number> {
    const { rows } = await pool.query<{ total: number }>(
      `SELECT COALESCE(SUM(value_delta), 0) AS total FROM goal_progress_logs WHERE goal_id = $1`,
      [goalId]
    );
    return Number(rows[0].total);
  }

  async getProgressLogs(goalId: string, limit = 20): Promise<GoalProgressLog[]> {
    const { rows } = await pool.query<GoalProgressLog>(
      `SELECT * FROM goal_progress_logs WHERE goal_id = $1 ORDER BY logged_at DESC LIMIT $2`,
      [goalId, limit]
    );
    return rows;
  }
}
