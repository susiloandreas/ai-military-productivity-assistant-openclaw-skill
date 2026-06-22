import {
  buildCompletionPrompt,
  fallbackCompletion,
  reviewFacts,
  durationAnomaly,
} from '../composeCompletionCheer';
import { MissionCompleteResult } from '../../services/MissionService';
import { ProgressResult } from '../../services/GoalService';
import { Mission, Goal } from '../../types';

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    user_id: 'u1',
    title: 'refactor parser',
    habit_category_id: null,
    habit_type_id: null,
    eta_minutes: 60,
    mode: 'live',
    status: 'completed',
    started_at: new Date('2026-01-05T06:00:00'),
    completed_at: new Date('2026-01-05T06:45:00'),
    paused_at: null,
    actual_duration_minutes: 45,
    notes: null,
    created_at: new Date(),
    ...overrides,
  } as Mission;
}

function result(overrides: Partial<MissionCompleteResult> = {}): MissionCompleteResult {
  return { mission: mission(), goalProgress: null, ...overrides };
}

function goalProgress(overrides: Partial<ProgressResult> = {}): ProgressResult {
  return {
    goal: { title: 'Master TypeScript' } as Goal,
    progressLog: {} as ProgressResult['progressLog'],
    totalProgress: 120,
    milestonesUnlocked: [],
    goalCompleted: false,
    ...overrides,
  };
}

describe('composeCompletionCheer — review prompt', () => {
  it('builds an English review prompt grounded in the session facts', () => {
    const prompt = buildCompletionPrompt(result({ mission: mission({ title: 'refactor parser' }) }));
    expect(prompt).toContain('SESSION DATA');
    expect(prompt).toContain('reviewing the session');
    expect(prompt).toContain('refactor parser');
    expect(prompt).toContain('Duration: 45 minutes');
    expect(prompt).toContain('DO NOT praise the duration');
  });

  it('feeds the target duration into the prompt when a plan block matched', () => {
    const prompt = buildCompletionPrompt(
      result({ mission: mission({ title: 'workout', actual_duration_minutes: 45 }) }),
      60
    );
    expect(prompt).toContain('Target duration: 60 minutes');
  });

  it('marks the target as not set when no plan block matched', () => {
    const prompt = buildCompletionPrompt(result());
    expect(prompt).toContain('Target duration: not set');
  });

  it('surfaces a completed goal in the prompt', () => {
    const prompt = buildCompletionPrompt(
      result({ goalProgress: goalProgress({ goalCompleted: true }) })
    );
    expect(prompt).toContain('goal completed');
    expect(prompt).toContain('Master TypeScript');
  });

  it('renders a static English fallback referencing the mission', () => {
    const out = fallbackCompletion(result({ mission: mission({ title: 'refactor parser' }) }));
    expect(out).toContain('SESSION REVIEW');
    expect(out).toContain('refactor parser');
    expect(out).not.toMatch(/great|amazing|impressive/i);
  });
});

describe('reviewFacts — duration vs target', () => {
  it('computes the actual/target ratio as a percentage', () => {
    const f = reviewFacts(result({ mission: mission({ actual_duration_minutes: 180 }) }), 60);
    expect(f.ratioPct).toBe(300);
    expect(f.targetMinutes).toBe(60);
  });

  it('leaves the ratio null when no target is known', () => {
    const f = reviewFacts(result());
    expect(f.targetMinutes).toBeNull();
    expect(f.ratioPct).toBeNull();
  });

  it('the fallback flags a duration past 120% of target as too long', () => {
    const out = fallbackCompletion(
      result({ mission: mission({ title: 'workout', actual_duration_minutes: 180 }) }),
      60
    );
    expect(out).toContain('too long');
    expect(out).toMatch(/300%/);
  });

  it('the fallback calls 80–120% pacing reasonably balanced', () => {
    const out = fallbackCompletion(
      result({ mission: mission({ title: 'workout', actual_duration_minutes: 66 }) }),
      60
    );
    expect(out).toContain('reasonably balanced');
  });
});

describe('reviewFacts — off-plan start', () => {
  // Scheduled 06:00, started 08:00 → 120 min late, grace 30 → off-plan.
  const lateStart = () =>
    result({ mission: mission({ started_at: new Date('2026-01-05T08:00:00') }) });

  it('flags a start past the grace window as off-plan', () => {
    const f = reviewFacts(lateStart(), 60, '2026-01-05T06:00:00', 30);
    expect(f.lateMinutes).toBe(120);
    expect(f.offPlanStart).toBe(true);
  });

  it('does not flag a start within the grace window', () => {
    const onTime = result({ mission: mission({ started_at: new Date('2026-01-05T06:20:00') }) });
    const f = reviewFacts(onTime, 60, '2026-01-05T06:00:00', 30);
    expect(f.offPlanStart).toBe(false);
  });

  it('has no start verdict when the block is not scheduled', () => {
    const f = reviewFacts(result(), 60);
    expect(f.plannedStartHHMM).toBeNull();
    expect(f.lateMinutes).toBeNull();
    expect(f.offPlanStart).toBe(false);
  });

  it('the fallback calls out an off-plan start', () => {
    const out = fallbackCompletion(lateStart(), 60, '2026-01-05T06:00:00', 30);
    expect(out).toContain('off-plan');
    expect(out).toContain('06:00');
  });

  it('falls back to the default grace for an ad-hoc block', () => {
    // 40 min late, no schedule grace → default 30 → off-plan.
    const f = reviewFacts(
      result({ mission: mission({ started_at: new Date('2026-01-05T06:40:00') }) }),
      60,
      '2026-01-05T06:00:00',
      null
    );
    expect(f.graceMinutes).toBe(30);
    expect(f.offPlanStart).toBe(true);
  });
});

describe('durationAnomaly — absolute health/timer caps', () => {
  it('flags an over-long sleep', () => {
    const longSleep = result({ mission: mission({ title: 'tidur', actual_duration_minutes: 15 * 60 + 11 }) });
    expect(durationAnomaly(longSleep)).toMatch(/oversleeping/);
  });

  it('does not flag a healthy sleep', () => {
    const ok = result({ mission: mission({ title: 'tidur', actual_duration_minutes: 8 * 60 }) });
    expect(durationAnomaly(ok)).toBeNull();
  });

  it('flags an absurdly long generic session as a forgotten timer', () => {
    const marathon = result({ mission: mission({ title: 'baca buku', actual_duration_minutes: 17 * 60 }) });
    expect(durationAnomaly(marathon)).toMatch(/timer left running/);
  });

  it('does not flag missions with no recorded duration', () => {
    expect(durationAnomaly(result({ mission: mission({ actual_duration_minutes: null }) }))).toBeNull();
  });

  it('the fallback treats an anomaly as an unhealthy pattern, not a win', () => {
    const longSleep = result({ mission: mission({ title: 'tidur', actual_duration_minutes: 15 * 60 + 11 }) });
    const out = fallbackCompletion(longSleep);
    expect(out).toContain('unhealthy pattern');
    expect(out).not.toMatch(/great|amazing|impressive/i);
  });
});
