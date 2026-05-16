// Must mock before requiring server (which imports db at module load time)
jest.mock('../db/connection', () => ({
  pool: { query: jest.fn() },
  redisConnection: { options: {} },
}));
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(true),
  })),
  Worker: jest.fn(),
}));

// Mock all repositories to avoid real DB calls
jest.mock('../repositories/MissionRepository');
jest.mock('../repositories/HabitRepository');
jest.mock('../repositories/GoalRepository');
jest.mock('../repositories/TennisRepository');
jest.mock('../repositories/SleepRepository');
jest.mock('../repositories/DisciplineRepository');
jest.mock('../repositories/CoachingRepository');

import request from 'supertest';
import app from '../server';
import { MissionRepository } from '../repositories/MissionRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { SleepRepository } from '../repositories/SleepRepository';

const MockMissionRepo = MissionRepository as jest.MockedClass<typeof MissionRepository>;
const MockSleepRepo = SleepRepository as jest.MockedClass<typeof SleepRepository>;

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ironclaw-ai');
  });
});

describe('POST /commands', () => {
  it('returns 400 when command field is missing', async () => {
    const res = await request(app).post('/commands').send({});
    expect(res.status).toBe(400);
    expect(res.body.output).toContain('OPERATION FAILED');
  });

  it('returns error output for unknown root command', async () => {
    const res = await request(app)
      .post('/commands')
      .send({ command: '/unknown test' });
    expect(res.status).toBe(200);
    expect(res.body.output).toContain('Unknown command');
  });

  it('returns JSON with output field for valid command structure', async () => {
    // Mock active mission lookup to return null
    MockMissionRepo.prototype.getActive = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/commands')
      .send({ command: '/mission status' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('output');
    expect(typeof res.body.output).toBe('string');
  });

  it('handles /sleep status with no data gracefully', async () => {
    MockSleepRepo.prototype.getLastLog = jest.fn().mockResolvedValue(null);
    MockSleepRepo.prototype.getDebtMinutes = jest.fn().mockResolvedValue(0);
    MockSleepRepo.prototype.getAverageQualityScore = jest.fn().mockResolvedValue(0);
    MockSleepRepo.prototype.getRecent = jest.fn().mockResolvedValue([]);

    const res = await request(app)
      .post('/commands')
      .send({ command: '/sleep status' });
    expect(res.status).toBe(200);
    expect(res.body.output).toContain('SLEEP STATUS');
  });

  it('uses DEFAULT_USER_ID when userId not provided', async () => {
    MockMissionRepo.prototype.getActive = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/commands')
      .send({ command: '/mission status' });
    // Should succeed (no userId required in body)
    expect(res.status).toBe(200);
  });
});
