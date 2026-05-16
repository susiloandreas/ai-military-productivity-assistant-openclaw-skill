import { readFileSync } from 'fs';
import { join } from 'path';

const SKILL_PATH = join(__dirname, '../SKILL.md');
const content = readFileSync(SKILL_PATH, 'utf-8');

describe('SKILL.md — structure validation', () => {
  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(100);
  });

  it('has valid YAML frontmatter with name and description', () => {
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/name:\s+ironclaw-ai/);
    expect(content).toMatch(/description:/);
    expect(content).toMatch(/---/);
  });

  describe('Layer 1: Command Reference', () => {
    it('documents /mission commands', () => {
      expect(content).toContain('/mission start');
      expect(content).toContain('/mission complete');
      expect(content).toContain('/mission abort');
      expect(content).toContain('/mission extend');
      expect(content).toContain('/mission status');
    });

    it('documents /habit commands', () => {
      expect(content).toContain('/habit category add');
      expect(content).toContain('/habit log');
      expect(content).toContain('/habit summary');
    });

    it('documents /tennis commands', () => {
      expect(content).toContain('/tennis start');
      expect(content).toContain('/tennis log');
      expect(content).toContain('/tennis summary');
    });

    it('documents /sleep commands', () => {
      expect(content).toContain('/sleep log');
      expect(content).toContain('/sleep status');
    });

    it('documents /status commands', () => {
      expect(content).toContain('/status briefing');
      expect(content).toContain('/status goals');
    });

    it('documents all valid tennis session types', () => {
      const types = ['serve', 'footwork', 'rally', 'endurance', 'match', 'other'];
      for (const t of types) {
        expect(content).toContain(t);
      }
    });

    it('documents sleep quality values', () => {
      expect(content).toContain('poor');
      expect(content).toContain('fair');
      expect(content).toContain('good');
      expect(content).toContain('excellent');
    });

    it('documents duration format', () => {
      expect(content).toMatch(/2h.*45m|duration.*format/i);
    });
  });

  describe('Layer 2: Natural Language', () => {
    it('has NL interpretation section', () => {
      expect(content).toContain('Natural Language');
    });

    it('covers activity logging NL examples', () => {
      expect(content).toContain('tennis');
      expect(content).toContain('duration');
    });

    it('covers coaching query NL examples', () => {
      expect(content).toContain('coaching');
    });

    it('mentions military tone guidelines', () => {
      expect(content).toMatch(/military|tone|OPTIMAL|DEGRADED|CRITICAL/i);
    });
  });

  describe('Phase 2 Automations', () => {
    it('documents morning briefing automation', () => {
      expect(content).toContain('morning-briefing');
      expect(content).toContain('0 6 * * *');
    });

    it('documents evening debrief automation', () => {
      expect(content).toContain('evening-debrief');
      expect(content).toContain('0 22 * * *');
    });

    it('documents discipline-check automation', () => {
      expect(content).toContain('discipline-window');
      expect(content).toContain('*/15 * * * *');
    });

    it('references IRONCLAW_SERVICE_URL env variable', () => {
      expect(content).toContain('IRONCLAW_SERVICE_URL');
    });
  });

  describe('Service endpoints referenced', () => {
    it('references /health endpoint', () => {
      expect(content).toContain('/health');
    });

    it('references /commands endpoint (implied via POST /commands)', () => {
      expect(content).toContain('/commands');
    });
  });
});
