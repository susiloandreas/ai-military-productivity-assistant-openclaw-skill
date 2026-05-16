import { TennisTrainingLog, TennisSessionType } from '../types';

export interface TennisAnalysis {
  sessionsThisWeek: number;
  totalMinutes: number;
  minutesByType: Partial<Record<TennisSessionType, number>>;
  consistencyScore: number; // 0-100; 5 sessions/week = 100
  dominantType: TennisSessionType | null;
}

/** 5 sessions per week = full consistency score */
const TARGET_SESSIONS_PER_WEEK = 5;

export function analyzeTennisSessions(logs: TennisTrainingLog[]): TennisAnalysis {
  const minutesByType: Partial<Record<TennisSessionType, number>> = {};
  let totalMinutes = 0;

  for (const log of logs) {
    minutesByType[log.session_type] =
      (minutesByType[log.session_type] ?? 0) + log.duration_minutes;
    totalMinutes += log.duration_minutes;
  }

  const sessionsThisWeek = logs.length;
  const consistencyScore = Math.min(
    100,
    Math.round((sessionsThisWeek / TARGET_SESSIONS_PER_WEEK) * 100)
  );

  let dominantType: TennisSessionType | null = null;
  let maxMinutes = 0;
  for (const [type, minutes] of Object.entries(minutesByType)) {
    if ((minutes ?? 0) > maxMinutes) {
      maxMinutes = minutes ?? 0;
      dominantType = type as TennisSessionType;
    }
  }

  return { sessionsThisWeek, totalMinutes, minutesByType, consistencyScore, dominantType };
}
