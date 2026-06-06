// ── Users ──────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  created_at: Date;
}

// ── Habit Categories ───────────────────────────────────────────────────────
export interface HabitCategory {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

// ── Goals ──────────────────────────────────────────────────────────────────
export type GoalStatus = 'active' | 'achieved' | 'missed' | 'paused';

export interface Goal {
  id: string;
  user_id: string;
  habit_category_id: string;
  habit_type_id: string | null; // when set, the goal targets a specific habit type
  title: string;
  target_description: string | null;
  deadline: Date | null;
  status: GoalStatus;
  created_at: Date;
}

// ── Milestones ─────────────────────────────────────────────────────────────
export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  target_value: number;
  unit: string;
  is_final_exam: boolean;
  achieved_at: Date | null;
  created_at: Date;
}

// ── Habit Types & Logs ─────────────────────────────────────────────────────
export interface HabitType {
  id: string;
  habit_category_id: string;
  name: string;
  unit: string;
  created_at: Date;
}

export interface HabitLog {
  id: string;
  habit_type_id: string;
  user_id: string;
  duration_minutes: number;
  logged_at: Date;
  note: string | null;
}

// ── Habit Schedules ────────────────────────────────────────────────────────
// A habit the user is expected to perform at a set time on set weekdays,
// e.g. "running at 06:00 on Mon/Wed/Fri". Drives the idle loss-aversion nudge.
export interface HabitSchedule {
  id: string;
  habit_type_id: string;
  user_id: string;
  expected_at: string;     // 'HH:MM:SS' (pg TIME)
  grace_minutes: number;
  days_of_week: number[];  // 0=Sunday .. 6=Saturday
  active: boolean;
  created_at: Date;
}

export interface HabitScheduleWithNames extends HabitSchedule {
  habit_type_name: string;
  category_name: string;
}

// ── Goal Progress Logs ─────────────────────────────────────────────────────
export interface GoalProgressLog {
  id: string;
  goal_id: string;
  source_mission_id: string | null;
  source_habit_log_id: string | null;
  value_delta: number;
  unit: string;
  logged_at: Date;
}

// ── Missions ───────────────────────────────────────────────────────────────
export type MissionStatus = 'active' | 'completed' | 'paused' | 'failed' | 'eta_expired';

export interface Mission {
  id: string;
  user_id: string;
  title: string;
  habit_category_id: string | null;
  eta_minutes: number | null;
  status: MissionStatus;
  started_at: Date;
  completed_at: Date | null;
  paused_at: Date | null;
  actual_duration_minutes: number | null;
  notes: string | null;
  created_at: Date;
}

export interface MissionSession {
  id: string;
  mission_id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_minutes: number | null;
  session_type: 'work' | 'pause';
}

// ── Tennis ─────────────────────────────────────────────────────────────────
export type TennisSessionType = 'serve' | 'footwork' | 'rally' | 'endurance' | 'match' | 'other';

export interface TennisTrainingLog {
  id: string;
  mission_id: string | null;
  user_id: string;
  session_type: TennisSessionType;
  duration_minutes: number;
  notes: string | null;
  logged_at: Date;
}

// ── Sleep ──────────────────────────────────────────────────────────────────
export interface SleepLog {
  id: string;
  user_id: string;
  duration_minutes: number;
  wake_time: string | null;
  sleep_quality: 'poor' | 'fair' | 'good' | 'excellent' | null;
  notes: string | null;
  logged_at: Date;
}

// ── Discipline Score ───────────────────────────────────────────────────────
export interface DisciplineScore {
  id: string;
  user_id: string;
  score: number;
  mission_consistency: number | null;
  sleep_consistency: number | null;
  focus_duration: number | null;
  estimation_accuracy: number | null;
  completion_rate: number | null;
  wake_consistency: number | null;
  habit_adherence: number | null;
  goal_adherence: number | null;
  distraction_frequency: number | null;
  calculated_at: Date;
}

// ── Coaching ───────────────────────────────────────────────────────────────
export interface CoachingFeedback {
  id: string;
  user_id: string;
  category: string | null;
  rule_triggered: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: Date;
}

// ── Analytics ─────────────────────────────────────────────────────────────
export interface EstimationAnalysis {
  sampleCount: number;
  avgAccuracyPct: number;    // 100 = perfect; >100 = ran over; <100 = finished early
  avgOverageMinutes: number; // positive = ran over, negative = finished early
  bias: 'on-target' | 'overestimator' | 'underestimator';
}

export interface SubScoreBreakdown {
  missionConsistency: number;
  completionRate: number;
  estimationAccuracy: number;
  sleepConsistency: number;
  focusDuration: number;
  wakeConsistency: number;
  habitAdherence: number;
  goalAdherence: number;
  distractionFrequency: number;
  overall: number;
}

export interface CoachingInsight {
  rule: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  category: string | null;
}

// ── Shared ─────────────────────────────────────────────────────────────────
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export interface CommandRequest {
  command: string;
  userId?: string;
}

export interface CommandResponse {
  output: string;
}
