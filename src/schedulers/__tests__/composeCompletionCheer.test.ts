import {
  buildCompletionPrompt,
  fallbackCompletion,
  rewardTier,
  durationConcern,
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
    started_at: new Date(),
    completed_at: new Date(),
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
    goal: { title: 'Kuasai TypeScript' } as Goal,
    progressLog: {} as ProgressResult['progressLog'],
    totalProgress: 120,
    milestonesUnlocked: [],
    goalCompleted: false,
    ...overrides,
  };
}

describe('composeCompletionCheer', () => {
  it('builds a positive-reinforcement prompt grounded in the completed mission', () => {
    const prompt = buildCompletionPrompt(result({ mission: mission({ title: 'refactor parser' }) }));
    expect(prompt).toContain('SELESAI');
    expect(prompt).toContain('PENGUATAN POSITIF');
    expect(prompt).toContain('refactor parser');
    expect(prompt).toContain('durasi 45m'); // duration is fed in
  });

  it('surfaces a completed goal in the prompt', () => {
    const prompt = buildCompletionPrompt(
      result({ goalProgress: goalProgress({ goalCompleted: true }) })
    );
    expect(prompt).toContain('GOAL TUNTAS');
    expect(prompt).toContain('Kuasai TypeScript');
  });

  it('renders a static motivational fallback referencing the mission', () => {
    const out = fallbackCompletion(result({ mission: mission({ title: 'refactor parser' }) }));
    expect(out).toContain('refactor parser');
    expect(out).toContain('KEMENANGAN');
  });

  it('celebrates a completed goal in the fallback', () => {
    const out = fallbackCompletion(result({ goalProgress: goalProgress({ goalCompleted: true }) }));
    expect(out).toContain('GOAL TUNTAS');
    expect(out).toContain('Kuasai TypeScript');
  });
});

describe('composeCompletionCheer — habit review on unhealthy duration', () => {
  const longSleep = () =>
    result({ mission: mission({ title: 'tidur', actual_duration_minutes: 15 * 60 + 11 }) });

  it('flags an over-long sleep as a concern', () => {
    expect(durationConcern(longSleep())).toMatch(/tidur terlalu lama/);
  });

  it('does not flag a healthy sleep', () => {
    const ok = result({ mission: mission({ title: 'tidur', actual_duration_minutes: 8 * 60 }) });
    expect(durationConcern(ok)).toBeNull();
  });

  it('flags an absurdly long generic session as a forgotten timer', () => {
    const marathon = result({ mission: mission({ title: 'baca buku', actual_duration_minutes: 17 * 60 }) });
    expect(durationConcern(marathon)).toMatch(/timer lupa/);
  });

  it('does not flag missions with no recorded duration', () => {
    expect(durationConcern(result({ mission: mission({ actual_duration_minutes: null }) }))).toBeNull();
  });

  it('switches the prompt to an honest review, not celebration', () => {
    const prompt = buildCompletionPrompt(longSleep(), 4);
    expect(prompt).toContain('TINJAUAN KEBIASAAN');
    expect(prompt).toContain('KOREKSI YANG SUPORTIF');
    expect(prompt).toMatch(/JANGAN memuji/);
    expect(prompt).not.toContain('PENGUATAN POSITIF');
  });

  it('reviews instead of cheering in the fallback, with no streak banner', () => {
    const out = fallbackCompletion(longSleep(), 7);
    expect(out).toContain('ditinjau');
    expect(out).toContain('dikoreksi');
    expect(out).not.toContain('STREAK 7 HARI');
  });
});

describe('composeCompletionCheer — escalating reward tier', () => {
  it('maps streak length to tiers 1/3/7/14/30', () => {
    expect(rewardTier(0)).toBe(1);
    expect(rewardTier(2)).toBe(1);
    expect(rewardTier(3)).toBe(3);
    expect(rewardTier(6)).toBe(3);
    expect(rewardTier(7)).toBe(7);
    expect(rewardTier(13)).toBe(7);
    expect(rewardTier(14)).toBe(14);
    expect(rewardTier(30)).toBe(30);
    expect(rewardTier(100)).toBe(30);
  });

  it('feeds the streak count and tier into the prompt', () => {
    const prompt = buildCompletionPrompt(result(), 7);
    expect(prompt).toContain('7 hari beruntun');
    expect(prompt).toContain('tingkat perayaan: 7');
  });

  it('omits a streak banner when there is no streak yet', () => {
    const out = fallbackCompletion(result(), 0);
    expect(out).not.toContain('STREAK');
  });

  it('shows an escalating streak banner in the fallback for longer streaks', () => {
    const short = fallbackCompletion(result(), 3);
    expect(short).toContain('STREAK 3 HARI');
    const long = fallbackCompletion(result(), 30);
    expect(long).toContain('STREAK 30 HARI');
    expect(long).toContain('🔥🔥🔥'); // loudest tier
  });
});
