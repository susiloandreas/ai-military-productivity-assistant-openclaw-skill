import { analyzeTennisSessions } from '../../analytics/TennisAnalyzer';
import { TennisTrainingLog } from '../../types';

const makeLog = (sessionType: TennisTrainingLog['session_type'], durationMinutes: number): TennisTrainingLog => ({
  id: 'log-1',
  user_id: 'user-1',
  mission_id: null,
  session_type: sessionType,
  duration_minutes: durationMinutes,
  notes: null,
  logged_at: new Date(),
});

describe('analyzeTennisSessions', () => {
  it('returns zero state for empty log list', () => {
    const result = analyzeTennisSessions([]);
    expect(result.sessionsThisWeek).toBe(0);
    expect(result.totalMinutes).toBe(0);
    expect(result.consistencyScore).toBe(0);
    expect(result.dominantType).toBeNull();
  });

  it('counts sessions and total minutes', () => {
    const logs = [makeLog('serve', 60), makeLog('footwork', 45)];
    const result = analyzeTennisSessions(logs);
    expect(result.sessionsThisWeek).toBe(2);
    expect(result.totalMinutes).toBe(105);
  });

  it('identifies the dominant session type by total minutes', () => {
    const logs = [
      makeLog('serve', 30),
      makeLog('serve', 30),   // 60 min serve
      makeLog('rally', 90),   // 90 min rally — dominant
    ];
    const result = analyzeTennisSessions(logs);
    expect(result.dominantType).toBe('rally');
  });

  it('caps consistency score at 100 for 5+ sessions', () => {
    const logs = Array.from({ length: 6 }, () => makeLog('endurance', 30));
    const result = analyzeTennisSessions(logs);
    expect(result.consistencyScore).toBe(100);
  });

  it('gives 60 consistency for 3 sessions (3/5 * 100)', () => {
    const logs = [makeLog('serve', 30), makeLog('footwork', 30), makeLog('match', 60)];
    const result = analyzeTennisSessions(logs);
    expect(result.consistencyScore).toBe(60);
  });

  it('accumulates minutes by type correctly', () => {
    const logs = [makeLog('serve', 30), makeLog('serve', 45)];
    const result = analyzeTennisSessions(logs);
    expect(result.minutesByType['serve']).toBe(75);
  });
});
