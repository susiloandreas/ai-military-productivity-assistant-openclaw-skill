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
import { StreakRepository } from './repositories/StreakRepository';
import { PlanRepository } from './repositories/PlanRepository';
import { GoogleTokenRepository } from './repositories/GoogleTokenRepository';
import { CalendarEventRepository } from './repositories/CalendarEventRepository';

// Services
import { GoalService } from './services/GoalService';
import { MissionService } from './services/MissionService';
import { StreakService } from './services/StreakService';
import { PlanService } from './services/PlanService';
import { HabitService } from './services/HabitService';
import { TennisService } from './services/TennisService';
import { SleepService } from './services/SleepService';
import { BriefingService } from './services/BriefingService';
import { DisciplineScoreService } from './services/DisciplineScoreService';
import { CoachingEngine } from './services/CoachingEngine';
import { DebriefService } from './services/DebriefService';
import { GoogleCalendarService } from './services/GoogleCalendarService';
import { HabitCalendarSyncService } from './services/HabitCalendarSyncService';
import { CalendarSyncService } from './services/CalendarSyncService';

// Analytics
import { PerformanceAnalyzer } from './analytics/PerformanceAnalyzer';

// Commands
import { handleMissionCommand } from './commands/missionCommands';
import { handleHabitCommand } from './commands/habitCommands';
import { handleTennisCommand } from './commands/tennisCommands';
import { handleSleepCommand } from './commands/sleepCommands';
import { handleStatusCommand } from './commands/statusCommands';
import { handlePlanCommand } from './commands/planCommands';
import { handleCalendarCommand } from './commands/calendarCommands';

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
const streakRepo       = new StreakRepository();
const planRepo         = new PlanRepository();
const googleTokenRepo  = new GoogleTokenRepository();
const calendarEventRepo = new CalendarEventRepository();

const goalService      = new GoalService(goalRepo, habitRepo);
const streakService    = new StreakService(streakRepo, habitRepo);
const planService      = new PlanService(planRepo, habitRepo);
const missionService   = new MissionService(missionRepo, goalRepo, habitRepo, goalService, streakService, planService);
const habitService     = new HabitService(habitRepo, missionRepo, goalService);
const tennisService    = new TennisService(tennisRepo, missionService);
const sleepService     = new SleepService(sleepRepo);

const analyzer         = new PerformanceAnalyzer(missionRepo, goalRepo, sleepRepo);
const disciplineScoreService = new DisciplineScoreService(disciplineRepo, analyzer);
const coachingEngine   = new CoachingEngine(coachingRepo);
const debriefService   = new DebriefService(
  missionService, sleepService, goalService, disciplineScoreService, coachingEngine
);
const briefingService  = new BriefingService(
  missionService, sleepService, goalService, tennisService, disciplineScoreService, coachingEngine
);
const googleCalendarService = new GoogleCalendarService(googleTokenRepo);
const habitCalendarSyncService = new HabitCalendarSyncService(habitRepo, googleCalendarService);
const calendarSyncService = new CalendarSyncService(calendarEventRepo, googleCalendarService);

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ironclaw-ai', timestamp: new Date().toISOString() });
});

// ── Google Calendar OAuth ─────────────────────────────────────────────────────

/**
 * Start the Google consent flow. Redirects the browser to Google's consent
 * screen; `state` carries the user id back to the callback. Single-user for now
 * (DEFAULT_USER_ID) — pass ?userId=… to authorize a specific user.
 */
app.get('/auth/google', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : DEFAULT_USER_ID;
  try {
    res.redirect(googleCalendarService.getAuthUrl(userId));
  } catch (err) {
    console.error('Google auth start error:', err);
    res.status(500).send('Google OAuth is not configured. Set the GOOGLE_OAUTH_* env vars.');
  }
});

/**
 * OAuth callback. Google redirects here with ?code & ?state (the user id). We
 * exchange the code for tokens and persist them. `error` is present when the
 * user denies consent.
 */
app.get('/auth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return res.status(400).send(`Google authorization was denied: ${error}`);
  if (!code) return res.status(400).send('Missing authorization code.');

  const userId = typeof state === 'string' && state ? state : DEFAULT_USER_ID;
  try {
    const scope = await googleCalendarService.handleCallback(code, userId);
    res.send(`✅ Google Calendar connected. Granted scope: ${scope}. You can close this tab.`);
  } catch (err) {
    console.error('Google auth callback error:', err);
    res.status(500).send('Failed to complete Google authorization. Check server logs.');
  }
});

/**
 * Sync habits from the dedicated "Ironclaw Habits" Google Calendar into
 * habit_schedules. Idempotent; creates the calendar on first call. The user must
 * have connected via /auth/google first.
 */
app.post('/google/calendar/sync-habits', async (req: Request, res: Response) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : DEFAULT_USER_ID;
  try {
    const result = await habitCalendarSyncService.sync(userId);
    res.json(result);
  } catch (err) {
    console.error('Habit calendar sync error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Mirror TODAY's events from ALL of the user's Google calendars into
 * calendar_events; category is parsed from a #hashtag in each event title.
 * Requires /auth/google first.
 */
app.post('/google/calendar/sync', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { userId?: string };
  const userId = typeof body.userId === 'string' ? body.userId : DEFAULT_USER_ID;
  try {
    const result = await calendarSyncService.syncAll(userId);
    res.json(result);
  } catch (err) {
    console.error('Calendar sync error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Read mirrored calendar events. Query: category, from, to, limit. */
app.get('/google/calendar/events', async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const userId = typeof q.userId === 'string' ? q.userId : DEFAULT_USER_ID;
  try {
    const events = await calendarEventRepo.list(userId, {
      category: q.category,
      from: q.from,
      to: q.to,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    res.json({ events });
  } catch (err) {
    console.error('Calendar events read error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
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
        output = await handleHabitCommand(args, uid, habitService, habitCalendarSyncService);
        break;
      case '/calendar':
        output = await handleCalendarCommand(args, uid, calendarSyncService, calendarEventRepo);
        break;
      case '/plan':
        output = await handlePlanCommand(args, uid, planService);
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
          `Unknown command: ${root}. Try /mission, /habit, /plan, /tennis, /sleep, /status, /calendar`
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
    const [score, activeMission, recentMissions] = await Promise.all([
      disciplineScoreService.calculateAndSave(DEFAULT_USER_ID),
      missionRepo.getActive(DEFAULT_USER_ID),
      missionRepo.getActivitySince(DEFAULT_USER_ID, 15),
    ]);

    const insights = coachingEngine.generate(score);
    const alerts = insights.filter(i => i.severity === 'critical' || i.severity === 'warning');

    // Idle nudge: no active mission and nothing logged in the last 15 minutes.
    // getActivitySince covers retroactive (habit) logs too, since they are missions now.
    const isIdle = !activeMission && recentMissions.length === 0;
    if (isIdle) {
      alerts.unshift({
        rule: 'idle_15min',
        message: 'IDLE ALERT: No mission active and no activity logged in the past 15 minutes. What is your current objective?',
        severity: 'warning',
        category: null,
      });
    }

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
