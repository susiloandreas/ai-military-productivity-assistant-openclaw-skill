import { replanLine } from '../idleReminderMessages';

describe('replanLine (slippage re-plan offer)', () => {
  it('suggests a geser command at the next half-hour ≥30 min out', () => {
    // 10:05 + 30 = 10:35 → round up to 11:00
    expect(replanLine('lari', new Date(2026, 0, 5, 10, 5))).toContain('geser lari ke 11:00');
  });

  it('rounds an exact half-hour up to that slot', () => {
    // 10:00 + 30 = 10:30 → already on a slot → 10:30
    expect(replanLine('run', new Date(2026, 0, 5, 10, 0))).toContain('ke 10:30');
  });

  it('only proposes — it does not mutate anything', () => {
    // Pure string builder: same inputs, same output, no side effects.
    const at = new Date(2026, 0, 5, 14, 0);
    expect(replanLine('meditasi', at)).toBe(replanLine('meditasi', at));
  });
});
