import { MINIMUM_VIABLE_MINUTES, recoveryState } from '../missRecovery';

describe('missRecovery — recoveryState', () => {
  it('treats a first miss (0–1) as recoverable with a minimum-viable offer', () => {
    expect(recoveryState(0)).toEqual({ decision: 'recoverable', offerMinimumViable: true });
    expect(recoveryState(1)).toEqual({ decision: 'recoverable', offerMinimumViable: true });
  });

  it('escalates on a second consecutive miss (never miss twice)', () => {
    expect(recoveryState(2).decision).toBe('escalate');
    expect(recoveryState(5).decision).toBe('escalate');
  });

  it('always offers the minimum-viable version', () => {
    expect(recoveryState(0).offerMinimumViable).toBe(true);
    expect(recoveryState(3).offerMinimumViable).toBe(true);
  });

  it('exposes a small minimum-viable threshold', () => {
    expect(MINIMUM_VIABLE_MINUTES).toBeGreaterThan(0);
    expect(MINIMUM_VIABLE_MINUTES).toBeLessThanOrEqual(5);
  });
});
