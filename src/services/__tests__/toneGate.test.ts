import { shouldUseLossAversion, toneFor } from '../toneGate';

describe('toneGate — shouldUseLossAversion', () => {
  it('defaults to competence (false) on a good day', () => {
    expect(shouldUseLossAversion({})).toBe(false);
    expect(shouldUseLossAversion({ maxConsecutiveMisses: 1, streakAtRiskToday: false })).toBe(false);
  });

  it('fires when an active streak is at risk of breaking today', () => {
    expect(shouldUseLossAversion({ streakAtRiskToday: true })).toBe(true);
  });

  it('fires on two or more consecutive missed scheduled days', () => {
    expect(shouldUseLossAversion({ maxConsecutiveMisses: 2 })).toBe(true);
    expect(shouldUseLossAversion({ maxConsecutiveMisses: 5 })).toBe(true);
  });

  it('fires on the nightly debrief', () => {
    expect(shouldUseLossAversion({ isNightlyDebrief: true })).toBe(true);
  });
});

describe('toneGate — toneFor', () => {
  it('maps the decision to a tone', () => {
    expect(toneFor({})).toBe('competence');
    expect(toneFor({ isNightlyDebrief: true })).toBe('loss_aversion');
    expect(toneFor({ maxConsecutiveMisses: 3 })).toBe('loss_aversion');
  });
});
