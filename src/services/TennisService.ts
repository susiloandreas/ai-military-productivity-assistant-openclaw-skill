import { TennisRepository } from '../repositories/TennisRepository';
import { MissionService } from './MissionService';
import { TennisTrainingLog, TennisSessionType } from '../types';
import { parseDurationToMinutes } from '../utils/duration';

const TENNIS_CATEGORY = 'tennis';

export interface TennisLogResult {
  trainingLog: TennisTrainingLog;
  missionId: string | null;
}

export class TennisService {
  constructor(
    private tennisRepo: TennisRepository,
    private missionService: MissionService
  ) {}

  async startSession(
    userId: string,
    sessionType: TennisSessionType,
    etaStr: string | null
  ): Promise<{ missionId: string }> {
    const title = `Tennis: ${sessionType}`;
    const mission = await this.missionService.start(userId, title, etaStr, TENNIS_CATEGORY);
    return { missionId: mission.id };
  }

  async completeSession(
    userId: string,
    sessionType: TennisSessionType,
    durationStr: string,
    notes?: string
  ): Promise<TennisLogResult> {
    const durationMinutes = parseDurationToMinutes(durationStr);

    let missionId: string | null = null;
    const activeMission = await this.missionService.getActiveMission(userId);
    if (activeMission && activeMission.habit_category_id) {
      const result = await this.missionService.complete(userId, durationStr, notes ?? null);
      missionId = result.mission.id;
    }

    const trainingLog = await this.tennisRepo.create(
      userId,
      sessionType,
      durationMinutes,
      missionId,
      notes
    );

    return { trainingLog, missionId };
  }

  async getWeeklySummary(userId: string) {
    const rows = await this.tennisRepo.getWeeklySummary(userId);
    const totalMinutes = await this.tennisRepo.getWeeklyTotalMinutes(userId);
    return { sessions: rows, totalMinutes };
  }

  async getLastSession(userId: string): Promise<Date | null> {
    return this.tennisRepo.getLastSessionDate(userId);
  }
}
