import { SleepRepository } from '../repositories/SleepRepository';
import { SleepLog } from '../types';

export interface SleepLogResult {
  log: SleepLog;
  debtMinutes: number;
  averageQuality: number;
}

export class SleepService {
  constructor(private sleepRepo: SleepRepository) {}

  async log(
    userId: string,
    durationMinutes: number,
    wakeTime: Date | null,
    quality: 'poor' | 'fair' | 'good' | 'excellent' | null,
    notes?: string
  ): Promise<SleepLogResult> {
    const log = await this.sleepRepo.create(userId, durationMinutes, wakeTime, quality, notes);
    const debtMinutes = await this.sleepRepo.getDebtMinutes(userId, 7);
    const averageQuality = await this.sleepRepo.getAverageQualityScore(userId, 7);
    return { log, debtMinutes, averageQuality };
  }

  async getStatus(userId: string): Promise<{
    lastLog: SleepLog | null;
    debtMinutes: number;
    averageQuality: number;
    recentLogs: SleepLog[];
  }> {
    const lastLog = await this.sleepRepo.getLastLog(userId);
    const debtMinutes = await this.sleepRepo.getDebtMinutes(userId, 7);
    const averageQuality = await this.sleepRepo.getAverageQualityScore(userId, 7);
    const recentLogs = await this.sleepRepo.getRecent(userId, 7);
    return { lastLog, debtMinutes, averageQuality, recentLogs };
  }

  // avgQuality on 1-4 scale (poor=1, fair=2, good=3, excellent=4)
  getReadinessLabel(debtMinutes: number, avgQuality: number): string {
    if (debtMinutes === 0 && avgQuality >= 3.5) return 'PEAK';
    if (debtMinutes <= 30 && avgQuality >= 3) return 'OPTIMAL';
    if (debtMinutes <= 60 && avgQuality >= 2) return 'ADEQUATE';
    if (debtMinutes <= 120) return 'DEGRADED';
    return 'CRITICAL';
  }
}
