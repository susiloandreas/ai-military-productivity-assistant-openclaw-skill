import { analyzeEstimations } from '../../analytics/EstimationAnalyzer';
import { Mission } from '../../types';

const makeMission = (eta: number | null, actual: number | null): Mission => ({
  id: 'mission-1',
  user_id: 'user-1',
  title: 'Test',
  habit_category_id: null,
  habit_type_id: null,
  eta_minutes: eta,
  mode: 'live',
  status: 'completed',
  started_at: new Date(),
  completed_at: new Date(),
  paused_at: null,
  actual_duration_minutes: actual,
  notes: null,
  created_at: new Date(),
});

describe('analyzeEstimations', () => {
  it('returns on-target defaults for empty input', () => {
    const result = analyzeEstimations([]);
    expect(result.sampleCount).toBe(0);
    expect(result.avgAccuracyPct).toBe(100);
    expect(result.avgOverageMinutes).toBe(0);
    expect(result.bias).toBe('on-target');
  });

  it('returns on-target defaults when no missions have both ETA and actual', () => {
    const result = analyzeEstimations([makeMission(60, null), makeMission(null, 45)]);
    expect(result.sampleCount).toBe(0);
    expect(result.bias).toBe('on-target');
  });

  it('gives 100% accuracy when actual equals ETA exactly', () => {
    const result = analyzeEstimations([makeMission(60, 60)]);
    expect(result.sampleCount).toBe(1);
    expect(result.avgAccuracyPct).toBe(100);
    expect(result.avgOverageMinutes).toBe(0);
    expect(result.bias).toBe('on-target');
  });

  it('detects underestimator when consistently running over', () => {
    const missions = [
      makeMission(30, 60),  // ran 30m over
      makeMission(30, 60),
      makeMission(30, 60),
    ];
    const result = analyzeEstimations(missions);
    expect(result.bias).toBe('underestimator');
    expect(result.avgOverageMinutes).toBe(30);
  });

  it('detects overestimator when consistently finishing early', () => {
    const missions = [
      makeMission(60, 30),  // finished 30m early
      makeMission(60, 30),
    ];
    const result = analyzeEstimations(missions);
    expect(result.bias).toBe('overestimator');
    expect(result.avgOverageMinutes).toBe(-30);
  });

  it('calculates accuracy score below 100 for imperfect estimates', () => {
    const result = analyzeEstimations([makeMission(60, 90)]);
    expect(result.avgAccuracyPct).toBeLessThan(100);
    expect(result.avgAccuracyPct).toBeGreaterThanOrEqual(0);
  });

  it('floors accuracy at 0 for extreme deviations', () => {
    const result = analyzeEstimations([makeMission(10, 100)]);
    expect(result.avgAccuracyPct).toBe(0);
  });
});
