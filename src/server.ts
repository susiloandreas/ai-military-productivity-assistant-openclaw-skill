import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';

// Repositories
import { MissionRepository } from './repositories/MissionRepository';
import { HabitRepository } from './repositories/HabitRepository';
import { GoalRepository } from './repositories/GoalRepository';
import { TennisRepository } from './repositories/TennisRepository';
import { SleepRepository } from './repositories/SleepRepository';
import { DisciplineRepository } from './repositories/DisciplineRepository';
import { CoachingRepository } from './repositories/CoachingRepository';

// Services
import { GoalService } from './services/GoalService';
import { MissionService } from './services/MissionService';
import { HabitService } from './services/HabitService';
import { TennisService } from './services/TennisService';
import { SleepService } from './services/SleepService';
import { BriefingService } from './services/BriefingService';
import { DisciplineScoreService } from './services/DisciplineScoreService';
import { CoachingEngine } from './services/CoachingEngine';
import { DebriefService } from './services/DebriefService';

// Analytics
import { PerformanceAnalyzer } from './analytics/PerformanceAnalyzer';

// Commands
import { handleMissionCommand } from './commands/missionCommands';
import { handleHabitCommand } from './commands/habitCommands';
import { handleTennisCommand } from './commands/tennisCommands';
import { handleSleepCommand } from './commands/sleepCommands';
import { handleStatusCommand } from './commands/statusCommands';

import { CommandRequest, CommandResponse, DEFAULT_USER_ID } from './types';
import { formatError } from './utils/formatter';

// ── Dependency wiring ────────────────────────────────────────────────────────
const missionRepo      = new MissionRepository();
const habitRepo        = new HabitRepository();
const goalRepo         = new GoalRepository();
const tennisRepo       = new TennisRepository();
const sleepRepo        = new SleepRepository();
const disciplineRepo   = new DisciplineRepository();
const coachingRepo     = new CoachingRepository();

const goalService      = new GoalService(goalRepo, habitRepo);
const missionService   = new MissionService(missionRepo, goalRepo, habitRepo, goalService);
const habitService     = new HabitService(habitRepo, goalRepo, goalService);
const tennisService    = new TennisService(tennisRepo, missionService);
const sleepService     = new SleepService(sleepRepo);

const analyzer         = new PerformanceAnalyzer(missionRepo, habitRepo, goalRepo, sleepRepo);
const disciplineScoreService = new DisciplineScoreService(disciplineRepo, analyzer);
const coachingEngine   = new CoachingEngine(coachingRepo);
const debriefService   = new DebriefService(
  missionService, sleepService, goalService, disciplineScoreService, coachingEngine
);
const briefingService  = new BriefingService(
  missionService, sleepService, goalService, tennisService, disciplineScoreService, coachingEngine
);

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ironclaw-ai', timestamp: new Date().toISOString() });
});

app.post('/commands', async (req: Request, res: Response) => {
  const { command, userId } = req.body as CommandRequest;
  const uid = userId ?? DEFAULT_USER_ID;

  if (!command || typeof command !== 'string') {
    const response: CommandResponse = { output: formatError('Missing command field.') };
    return res.status(400).json(response);
  }

  const tokens = command.trim().split(/\s+/);
  const [root, ...args] = tokens;
  let output: string;

  try {
    switch (root) {
      case '/mission':
        output = await handleMissionCommand(args, uid, missionService);
        break;
      case '/habit':
        output = await handleHabitCommand(args, uid, habitService);
        break;
      case '/tennis':
        output = await handleTennisCommand(args, uid, tennisService);
        break;
      case '/sleep':
        output = await handleSleepCommand(args, uid, sleepService);
        break;
      case '/status':
        output = await handleStatusCommand(
          args,
          uid,
          briefingService,
          goalService,
          missionService,
          disciplineScoreService,
          coachingEngine
        );
        break;
      default:
        output = formatError(
          `Unknown command: ${root}. Try /mission, /habit, /tennis, /sleep, /status`
        );
    }
  } catch (err) {
    console.error('Unhandled command error:', err);
    output = formatError('Internal server error. Check logs.');
  }

  const response: CommandResponse = { output };
  res.json(response);
});

// ── Notification endpoints (consumed by OpenClaw automations) ────────────────

/** Morning briefing — schedule: 0 6 * * * */
app.get('/notifications/briefing', async (_req: Request, res: Response) => {
  try {
    const text = await briefingService.getDailyBriefing(DEFAULT_USER_ID);
    res.json({ message: text });
  } catch (err) {
    console.error('Briefing error:', err);
    res.status(500).json({ message: null });
  }
});

/** Evening debrief — schedule: 0 22 * * * */
app.get('/notifications/debrief', async (_req: Request, res: Response) => {
  try {
    const text = await debriefService.getDebrief(DEFAULT_USER_ID);
    res.json({ message: text });
  } catch (err) {
    console.error('Debrief error:', err);
    res.status(500).json({ message: null });
  }
});

/**
 * Discipline window check — schedule: every 15 min
 * Returns { message: string } when an alert warrants delivery, else { message: null }.
 */
app.get('/notifications/discipline-check', async (_req: Request, res: Response) => {
  try {
    const score = await disciplineScoreService.calculateAndSave(DEFAULT_USER_ID);
    const insights = coachingEngine.generate(score);
    const alerts = insights.filter(i => i.severity === 'critical' || i.severity === 'warning');
    if (alerts.length > 0) {
      const prefix = alerts.some(i => i.severity === 'critical') ? '🚨 DISCIPLINE ALERT' : '⚠ DISCIPLINE WARNING';
      const text = alerts.map(i => i.message).join('\n');
      res.json({ message: `${prefix}\n\n${text}` });
    } else {
      res.json({ message: null });
    }
  } catch (err) {
    console.error('Discipline-check error:', err);
    res.status(500).json({ message: null });
  }
});

// ── Coaching endpoint ─────────────────────────────────────────────────────────

/** GET /coaching/insights?category=<name> */
app.get('/coaching/insights', async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  try {
    const score = await disciplineScoreService.calculateAndSave(DEFAULT_USER_ID);
    const insights = coachingEngine.generate(score, category);
    await coachingEngine.saveInsights(DEFAULT_USER_ID, insights);
    const lines = insights.map((ins, i) => `[${i + 1}] ${ins.message}`);
    res.json({ output: lines.join('\n') });
  } catch (err) {
    console.error('Coaching error:', err);
    res.status(500).json({ output: formatError('Could not generate coaching insights.') });
  }
});

// Global error handler (catches sync errors in middleware chain)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Express error:', err);
  res.status(500).json({ output: formatError('Internal server error.') });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`ironclaw-ai service running on port ${PORT}`);
});

export default app;
