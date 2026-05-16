import {
  formatSuccess,
  formatError,
  formatStatus,
  formatBlock,
  formatProgress,
} from '../../utils/formatter';

describe('formatSuccess', () => {
  it('produces a titled block with lines', () => {
    const result = formatSuccess('Mission Complete', ['Duration: 1h', 'Goal: advanced']);
    expect(result).toContain('MISSION COMPLETE');
    expect(result).toContain('Duration: 1h');
    expect(result).toContain('Goal: advanced');
  });

  it('uppercases the title', () => {
    const result = formatSuccess('test title', []);
    expect(result).toContain('TEST TITLE');
  });
});

describe('formatError', () => {
  it('contains OPERATION FAILED and the message', () => {
    const result = formatError('No active mission.');
    expect(result).toContain('OPERATION FAILED');
    expect(result).toContain('No active mission.');
  });
});

describe('formatStatus', () => {
  it('renders key-value pairs', () => {
    const result = formatStatus('Sleep Status', { Duration: '7h', Quality: 'good' });
    expect(result).toContain('SLEEP STATUS');
    expect(result).toContain('DURATION: 7h');
    expect(result).toContain('QUALITY: good');
  });

  it('omits null/undefined values', () => {
    const result = formatStatus('Test', { Present: 'yes', Missing: null, Also: undefined });
    expect(result).toContain('PRESENT: yes');
    expect(result).not.toContain('MISSING');
    expect(result).not.toContain('ALSO');
  });
});

describe('formatBlock', () => {
  it('renders title and sections', () => {
    const result = formatBlock('Daily Briefing', [
      { label: 'Sleep Intel', lines: ['7h rest', 'Quality: good'] },
      { label: 'Mission', lines: ['No active mission'] },
    ]);
    expect(result).toContain('DAILY BRIEFING');
    expect(result).toContain('SLEEP INTEL:');
    expect(result).toContain('7h rest');
    expect(result).toContain('Quality: good');
    expect(result).toContain('MISSION:');
    expect(result).toContain('No active mission');
  });
});

describe('formatProgress', () => {
  it('shows 50% bar for half progress', () => {
    const result = formatProgress(5, 10, 'hours');
    expect(result).toContain('50%');
    expect(result).toContain('5 / 10 hours');
  });

  it('shows 100% bar for full progress', () => {
    const result = formatProgress(10, 10, 'km');
    expect(result).toContain('100%');
  });

  it('caps at 100% even if over target', () => {
    const result = formatProgress(15, 10, 'km');
    expect(result).toContain('100%');
  });

  it('shows 0% bar for zero progress', () => {
    const result = formatProgress(0, 10, 'sessions');
    expect(result).toContain('0%');
  });
});
