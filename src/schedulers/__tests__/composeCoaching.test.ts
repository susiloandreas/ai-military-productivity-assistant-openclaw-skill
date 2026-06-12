import { composeCoaching } from '../composeCoaching';
import { generateText } from '../../utils/gemini';
import { MissionRepository } from '../../repositories/MissionRepository';
import { HabitRepository } from '../../repositories/HabitRepository';

jest.mock('../../utils/gemini', () => ({
  generateText: jest.fn(),
}));

const mockedGenerate = generateText as jest.MockedFunction<typeof generateText>;

const missionRepo = {
  getActive: jest.fn().mockResolvedValue(null),
  getHeld: jest.fn().mockResolvedValue([]),
  getRecentCompleted: jest.fn().mockResolvedValue([]),
  getHabitTypeIdsLoggedSince: jest.fn().mockResolvedValue([]),
} as unknown as MissionRepository;

const habitRepo = {
  getActiveSchedules: jest.fn().mockResolvedValue([]),
} as unknown as HabitRepository;

const NOON = new Date('2026-06-12T13:00:00');

describe('composeCoaching', () => {
  beforeEach(() => mockedGenerate.mockReset());

  it('returns the AI brief, with output room reserved beyond the thinking budget', async () => {
    mockedGenerate.mockResolvedValue('AI brief');
    const out = await composeCoaching(missionRepo, habitRepo, 'u1', 'siang', NOON);
    expect(out).toBe('AI brief');
    // The brief runs on the Pro thinking model: reasoning tokens bill against
    // maxOutputTokens, so the budget must bound thinking AND leave reply room —
    // otherwise the call hits MAX_TOKENS with no visible text and every brief
    // silently degrades to the static fallback.
    expect(mockedGenerate).toHaveBeenCalledWith(expect.any(String), {
      maxOutputTokens: 4096,
      thinkingBudget: 1024,
    });
  });

  it('falls back to the static slot message when Gemini fails', async () => {
    mockedGenerate.mockRejectedValue(new Error('Gemini returned no text (finishReason: MAX_TOKENS)'));
    const out = await composeCoaching(missionRepo, habitRepo, 'u1', 'siang', NOON);
    expect(out).toContain('CHECK SIANG');
  });
});
