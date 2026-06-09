import { buildNextStepPrompt, fallbackNextStep } from '../composeNextStep';
import { MINIMUM_VIABLE_MINUTES } from '../../services/missRecovery';
import { Mission } from '../../types';

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    user_id: 'u1',
    title: 'cek issue prod',
    habit_category_id: null,
    habit_type_id: null,
    eta_minutes: 30,
    mode: 'live',
    status: 'failed',
    started_at: new Date(),
    completed_at: null,
    paused_at: null,
    actual_duration_minutes: null,
    notes: null,
    created_at: new Date(),
    ...overrides,
  } as Mission;
}

describe('composeNextStep', () => {
  it('defaults to a recovery/competence prompt grounded in the failed mission and its reason', () => {
    const prompt = buildNextStepPrompt(mission({ title: 'cek issue prod', notes: 'lupa' }));
    expect(prompt).toContain('PEMULIHAN'); // recovery tone by default
    expect(prompt).not.toContain('TAKUT KEHILANGAN'); // no fear on a single failure
    expect(prompt).toContain('cek issue prod'); // the specific failed mission
    expect(prompt).toContain('lupa'); // the operator's reason is fed in
    expect(prompt).toContain(`${MINIMUM_VIABLE_MINUTES} menit`); // minimum-viable offer
  });

  it('uses loss-aversion framing only when that tone is requested', () => {
    const prompt = buildNextStepPrompt(mission({ title: 'cek issue prod' }), 'loss_aversion');
    expect(prompt).toContain('LOSS AVERSION');
    expect(prompt).toContain('TAKUT KEHILANGAN');
  });

  it('notes their absence when the mission has no reason', () => {
    const prompt = buildNextStepPrompt(mission({ notes: null }));
    expect(prompt).toContain('tidak memberi alasan');
  });

  it('renders a static recovery fallback referencing the mission title', () => {
    const out = fallbackNextStep(mission({ title: 'cek issue prod' }));
    expect(out).toContain('cek issue prod');
    expect(out).toContain('LANGKAH BERIKUTNYA');
    expect(out).toMatch(/mulai cek issue prod/); // actionable next-step suggestion
  });
});
