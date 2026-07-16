import 'dotenv/config';
import { getTelegramUpdates, sendTelegramMessage } from '../utils/telegram';
import { ParsedIntent } from '../nlp/missionParser';
import { PlanEditIntent } from '../nlp/planParser';
import { route, Action, PendingMission } from './conversationRouter';
import { MissionRepository } from '../repositories/MissionRepository';
import { GoalRepository } from '../repositories/GoalRepository';
import { HabitRepository } from '../repositories/HabitRepository';
import { GoalService } from '../services/GoalService';
import { MissionService } from '../services/MissionService';
import { StreakService } from '../services/StreakService';
import { StreakRepository } from '../repositories/StreakRepository';
import { PlanRepository } from '../repositories/PlanRepository';
import { PlanService } from '../services/PlanService';
import {
  replyStarted,
  replyCompleted,
  replyAborted,
  replyExtended,
  replyNeedExtendDuration,
  replyStatus,
  replyNotesSaved,
  replyExpiryNeedsStatus,
  replyExpiryResolved,
  replyHelp,
  replyHabitsToday,
  replyAbortNeedsTarget,
  replyError,
  replyPlan,
  replyPlanDraft,
  replyNextUp,
  replyCalendarEvents,
  replyCalendarConflict,
} from './telegramReplies';
import { composeCalendarSyncMessage } from './composeCalendarSync';
import { findConflictingEvents, DEFAULT_LOOKAHEAD_MIN } from './calendarConflict';
import { buildMissionCalendarEvent } from './missionCalendar';
import { parseDurationToMinutes } from '../utils/duration';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';
import { CalendarEventRepository } from '../repositories/CalendarEventRepository';
import { GoogleCalendarService } from '../services/GoogleCalendarService';
import { CalendarSyncService } from '../services/CalendarSyncService';
import { nextUpcomingBlock } from '../services/planEdit';
import { AbortNeedsTargetError } from '../services/MissionService';
import { composeCoaching } from './composeCoaching';
import { composeNextStepNudge } from './composeNextStep';
import { composeCompletionCheer } from './composeCompletionCheer';
import { slotForHour } from './coachingContext';
import { DEFAULT_USER_ID, Mission } from '../types';
import { redisConnection } from '../db/connection';

/** Local midnight for "logged today" lookups. */
function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Current streak for a just-completed mission — its habit-type streak when the
 * mission is habit-linked, else the overall streak. Drives the escalating cheer.
 */
async function streakCountFor(mission: { habit_type_id: string | null }): Promise<number> {
  try {
    if (mission.habit_type_id) {
      return await streakService.getHabitCurrent(DEFAULT_USER_ID, mission.habit_type_id);
    }
    return (await streakService.getSnapshot(DEFAULT_USER_ID)).overall.current;
  } catch {
    return 0;
  }
}

/**
 * Nudge toward the next scheduled block once a mission closes, so the operator
 * flows straight into it instead of going idle until the 15-min idle worker
 * picks them up. Silent when nothing is left on today's plan.
 */
async function sendNextUpNudge(now: Date = new Date()): Promise<void> {
  const blocks = await planService.getTodayPlan(DEFAULT_USER_ID, now);
  const nudge = replyNextUp(nextUpcomingBlock(blocks, now));
  if (nudge) await sendTelegramMessage(nudge).catch(() => null);
}

const LISTENER_TZ = process.env.TZ || 'Asia/Jakarta';

/**
 * Mirror a just-started mission onto Google Calendar, unless it is already there
 * (a same-title event overlaps its start — e.g. it was started from that event).
 * Best-effort: silent when Google isn't connected, never blocks the mission.
 */
async function addMissionToCalendar(mission: Mission, categoryName: string | null): Promise<void> {
  try {
    if (!(await googleCalendarService.isConnected(DEFAULT_USER_ID))) return;
    const start = new Date(mission.started_at);
    const events = await calendarEventRepo.list(DEFAULT_USER_ID, {
      from: startOfToday(start).toISOString(),
      to: new Date(start.getTime() + 24 * 60 * 60_000).toISOString(),
      limit: 200,
    });
    const event = buildMissionCalendarEvent(mission, categoryName, events, LISTENER_TZ);
    if (!event) return; // already on the calendar
    await googleCalendarService.createEvent(DEFAULT_USER_ID, event);
    console.log(`[Telegram Listener] Added mission "${mission.title}" to Google Calendar`);
  } catch (err) {
    console.warn(`[Telegram Listener] Could not add mission to calendar: ${(err as Error).message}`);
  }
}

// ── Dependency wiring (mirrors server.ts) ────────────────────────────────────
const missionRepo = new MissionRepository();
const goalRepo = new GoalRepository();
const habitRepo = new HabitRepository();
const streakRepo = new StreakRepository();
const planRepo = new PlanRepository();
const goalService = new GoalService(goalRepo, habitRepo);
const streakService = new StreakService(streakRepo, habitRepo);
const planService = new PlanService(planRepo, habitRepo);
const missionService = new MissionService(
  missionRepo,
  goalRepo,
  habitRepo,
  goalService,
  streakService,
  planService
);
const googleTokenRepo = new GoogleTokenRepository();
const googleCalendarService = new GoogleCalendarService(googleTokenRepo);
const calendarEventRepo = new CalendarEventRepository();
const calendarSyncService = new CalendarSyncService(calendarEventRepo, googleCalendarService);

const POLL_TIMEOUT_SEC = 30;
const ERROR_BACKOFF_MS = 5000;
const PENDING_MISSION_KEY = 'pending-mission-confirmation';
const PENDING_MISSION_TTL = 3600; // 1 hour

/** Only act on messages from the operator's own chat, when one is configured. */
function isAuthorizedChat(chatId: number | undefined): boolean {
  const allowed = process.env.TELEGRAM_CHAT_ID;
  if (!allowed) return true; // no restriction configured
  return String(chatId) === String(allowed);
}

/** Store a pending mission awaiting user confirmation. */
async function storePendingMission(userId: string, mission: PendingMission): Promise<void> {
  const key = `${PENDING_MISSION_KEY}:${userId}`;
  await redisConnection.setex(key, PENDING_MISSION_TTL, JSON.stringify(mission));
}

/**
 * Peek at a pending mission confirmation without consuming it — `handleText`
 * reads this on every message just to feed the router, so an unrelated reply
 * (the user typing something else while a conflict prompt sits unanswered)
 * must leave it intact for a later "ya".
 */
async function getPendingMission(userId: string): Promise<PendingMission | null> {
  const key = `${PENDING_MISSION_KEY}:${userId}`;
  const data = await redisConnection.get(key);
  return data ? JSON.parse(data) : null;
}

/** Consume a pending mission confirmation once it's actually been acted on. */
async function clearPendingMission(userId: string): Promise<void> {
  await redisConnection.del(`${PENDING_MISSION_KEY}:${userId}`);
}

/**
 * Fetch the two pieces of live conversation state, route the message through
 * the pure decision table, then execute whatever it decided. All the "what
 * does this message mean right now" branching lives in `route()` — this is
 * just wiring + I/O.
 */
async function handleText(text: string): Promise<void> {
  const [pending, awaiting] = await Promise.all([
    getPendingMission(DEFAULT_USER_ID),
    missionService.getMissionAwaitingNotes(DEFAULT_USER_ID),
  ]);
  await executeAction(route(text, pending, awaiting), text);
}

async function executeAction(action: Action, text: string): Promise<void> {
  switch (action.type) {
    case 'confirm_pending': {
      await clearPendingMission(DEFAULT_USER_ID);
      try {
        const { mission, heldMission } = await missionService.start(
          DEFAULT_USER_ID,
          action.pending.title,
          action.pending.etaStr,
          action.pending.categoryName
        );
        await sendTelegramMessage(replyStarted(mission, action.pending.categoryName, heldMission));
        await addMissionToCalendar(mission, action.pending.categoryName);
        console.log(
          `[Telegram Listener] Confirmed and started mission "${mission.title}"` +
            (heldMission ? ` (held "${heldMission.title}")` : '')
        );
      } catch (err) {
        const message = (err as Error).message;
        console.warn(`[Telegram Listener] Failed to start confirmed mission: ${message}`);
        await sendTelegramMessage(replyError(message)).catch(() => null);
      }
      return;
    }

    case 'confirm_calendar': {
      // Start the clashing calendar event as the mission instead. ETA = time left
      // until the event ends (open-ended when it has no/past end time).
      await clearPendingMission(DEFAULT_USER_ID);
      let etaStr: string | null = null;
      if (action.event.endsAt) {
        const remaining = Math.ceil((new Date(action.event.endsAt).getTime() - Date.now()) / 60_000);
        if (remaining > 0) etaStr = `${remaining}m`;
      }
      try {
        const { mission, heldMission } = await missionService.start(
          DEFAULT_USER_ID,
          action.event.title,
          etaStr,
          action.event.categoryName
        );
        await sendTelegramMessage(replyStarted(mission, action.event.categoryName, heldMission));
        console.log(`[Telegram Listener] Started calendar event as mission "${mission.title}"`);
      } catch (err) {
        const message = (err as Error).message;
        console.warn(`[Telegram Listener] Failed to start calendar mission: ${message}`);
        await sendTelegramMessage(replyError(message)).catch(() => null);
      }
      return;
    }

    case 'expiry_needs_status':
      // Re-prompt until a recognizable status (selesai/belum) is given.
      await sendTelegramMessage(replyExpiryNeedsStatus());
      return;

    case 'resolve_expired': {
      const result = await missionService.resolveExpiredMission(action.missionId, action.completed, action.notes);
      // A bare status ("selesai" with no notes) resolves the mission right away
      // but re-opens the awaiting-notes prompt — same deferred-notes pattern as
      // a normal completion — so the next free-text reply is captured.
      const notesPending = action.notes.trim() === '';
      if (notesPending) await missionService.requestNotes(result.mission.id);
      // Follow up with an AI message tuned to the outcome: a motivational cheer
      // on success, or a recovery nudge to start the next step on failure.
      if (result.mission.status === 'completed') {
        const streak = await streakCountFor(result.mission);
        await sendTelegramMessage(replyExpiryResolved(result, Math.random, streak));
        await sendTelegramMessage(
          await composeCompletionCheer(result, result.plannedMinutes, result.plannedStart, result.startGraceMinutes)
        ).catch(() => null);
        // Notes came inline, so this is already terminal — nudge toward what's
        // next. When notes are still pending, the nudge fires once they land
        // (see the record_notes case) so it isn't sent twice.
        if (!notesPending) await sendNextUpNudge();
      } else {
        await sendTelegramMessage(replyExpiryResolved(result));
        await sendTelegramMessage(await composeNextStepNudge(result.mission)).catch(() => null);
      }
      console.log(`[Telegram Listener] Resolved expired "${result.mission.title}" as ${result.mission.status}`);
      return;
    }

    case 'extend_expired': {
      const mission = await missionService.extendExpiredMission(action.missionId, action.extendStr);
      await sendTelegramMessage(replyExtended(mission));
      console.log(`[Telegram Listener] Revived expired "${mission.title}" with more time`);
      return;
    }

    case 'needs_extend_duration':
      await sendTelegramMessage(replyNeedExtendDuration());
      return;

    case 'expiry_command':
      // A real command arrived while ETA-expired-awaiting — the user moved on;
      // drop the prompt and run it like any other command.
      await missionService.clearNotesRequest(action.missionId);
      await runCommand(action.intent);
      return;

    case 'record_notes': {
      const updated = await missionService.recordNotes(action.missionId, action.notes);
      await sendTelegramMessage(replyNotesSaved(updated));
      await sendNextUpNudge();
      console.log(`[Telegram Listener] Saved notes for "${updated.title}"`);
      return;
    }

    case 'notes_command':
      // A command after a completion prompt — user moved on; drop the prompt.
      await missionService.clearNotesRequest(action.missionId);
      await runCommand(action.intent);
      return;

    case 'plan_edit':
      await runPlanEdit(action.edit, text);
      return;

    case 'silent':
      return; // not a recognized request in any state — stay silent

    case 'command':
      await runCommand(action.intent);
      return;
  }
}

/**
 * Plan propose-&-confirm: a bare "gas"/"tolak" accepts or rejects a pending AI
 * proposal. Accept/reject act only when a proposal is actually waiting, so a
 * bare "ok" with nothing to confirm stays silent; edits (geser/skip/tunda)
 * apply directly.
 */
async function runPlanEdit(planEdit: PlanEditIntent, text: string): Promise<void> {
  if (planEdit.kind === 'view') {
    const blocks = await planService.getTodayPlan(DEFAULT_USER_ID);
    await sendTelegramMessage(replyPlan(blocks)).catch(() => null);
    console.log("[Telegram Listener] Sent today's plan");
  } else if (planEdit.kind === 'draft') {
    const proposed = await planService.proposeDay(DEFAULT_USER_ID);
    await sendTelegramMessage(replyPlanDraft(proposed)).catch(() => null);
    console.log('[Telegram Listener] Drafted catch-up plan');
  } else {
    const gated = planEdit.kind === 'accept' || planEdit.kind === 'reject';
    if (!gated || (await planService.getProposed(DEFAULT_USER_ID)).length > 0) {
      const result = await planService.applyEdit(DEFAULT_USER_ID, text);
      await sendTelegramMessage(result.message).catch(() => null);
      console.log(`[Telegram Listener] Plan ${planEdit.kind}`);
    }
  }
}

/** Execute an ordinary mission command (start/complete/abort/extend/status/...). */
async function runCommand(intent: ParsedIntent): Promise<void> {
  try {
    switch (intent.kind) {
      case 'start': {
        // Warn if a calendar event is in progress now or starts within the ETA
        // ("now or starting soon") — the schedule source of truth is the calendar.
        const now = new Date();
        const etaMinutes = intent.etaStr ? parseDurationToMinutes(intent.etaStr) : null;
        const windowEndMs = now.getTime() + (etaMinutes ?? DEFAULT_LOOKAHEAD_MIN) * 60_000;
        const events = await calendarEventRepo.list(DEFAULT_USER_ID, {
          from: startOfToday(now).toISOString(),
          to: new Date(windowEndMs).toISOString(),
          limit: 100,
        });
        const conflicts = findConflictingEvents(events, now, etaMinutes);

        const conflictMsg = replyCalendarConflict(conflicts, intent.title);
        if (conflictMsg) {
          // A calendar event clashes — remind and ask for confirmation before
          // starting. Bare "ya" then starts it (confirm_pending flow, unchanged).
          await sendTelegramMessage(conflictMsg);
          const primary = conflicts[0].event;
          await storePendingMission(DEFAULT_USER_ID, {
            title: intent.title,
            etaStr: intent.etaStr,
            categoryName: intent.categoryName,
            createdAt: Date.now(),
            calendarEvent: {
              title: primary.title,
              categoryName: primary.category,
              endsAt: primary.ends_at ? new Date(primary.ends_at).toISOString() : null,
            },
          });
          console.log(
            `[Telegram Listener] Calendar conflict for "${intent.title}" — awaiting confirmation`
          );
          return;
        }

        // No conflicts — proceed with starting the mission immediately.
        const { mission, heldMission } = await missionService.start(
          DEFAULT_USER_ID,
          intent.title,
          intent.etaStr,
          intent.categoryName
        );
        await sendTelegramMessage(replyStarted(mission, intent.categoryName, heldMission));
        await addMissionToCalendar(mission, intent.categoryName);
        console.log(
          `[Telegram Listener] Started mission "${mission.title}"` +
            (heldMission ? ` (held "${heldMission.title}")` : '')
        );
        break;
      }
      case 'complete': {
        const result = await missionService.complete(DEFAULT_USER_ID, intent.actualStr, intent.notes);
        // Ask what was done only when no notes came inline ("selesai, <notes>");
        // the next free-text reply is then captured into notes.
        if (!intent.notes) await missionService.requestNotes(result.mission.id);
        const streak = await streakCountFor(result.mission);
        await sendTelegramMessage(replyCompleted(result, Math.random, streak));
        // Follow with an AI-generated coach review of the session — judging actual
        // duration vs the planned block and the start vs the plan window.
        await sendTelegramMessage(
          await composeCompletionCheer(
            result,
            result.plannedMinutes,
            result.plannedStart,
            result.startGraceMinutes
          )
        ).catch(() => null);
        // Notes came inline, so this completion is already terminal — nudge toward
        // what's next. When notes are still pending, the nudge fires once they land
        // (see the awaiting-notes branch above) so it isn't sent twice.
        if (intent.notes) await sendNextUpNudge();
        console.log(`[Telegram Listener] Completed mission "${result.mission.title}"`);
        break;
      }
      case 'abort': {
        const mission = await missionService.abort(DEFAULT_USER_ID, intent.target);
        await sendTelegramMessage(replyAborted(mission));
        await sendNextUpNudge();
        console.log(`[Telegram Listener] Aborted mission "${mission.title}"`);
        break;
      }
      case 'extend': {
        if (!intent.extendStr) {
          await sendTelegramMessage(replyNeedExtendDuration());
          break;
        }
        const mission = await missionService.extend(DEFAULT_USER_ID, intent.extendStr);
        await sendTelegramMessage(replyExtended(mission));
        console.log(`[Telegram Listener] Extended mission "${mission.title}"`);
        break;
      }
      case 'status': {
        const [mission, held] = await Promise.all([
          missionService.getActiveMission(DEFAULT_USER_ID),
          missionService.getHeldMissions(DEFAULT_USER_ID),
        ]);
        await sendTelegramMessage(replyStatus(mission, held));
        console.log('[Telegram Listener] Reported mission status');
        break;
      }
      case 'help': {
        await sendTelegramMessage(replyHelp());
        console.log('[Telegram Listener] Sent command help');
        break;
      }
      case 'habits': {
        const now = new Date();
        const [schedules, loggedTypeIds] = await Promise.all([
          habitRepo.getActiveSchedules(DEFAULT_USER_ID),
          missionRepo.getHabitTypeIdsLoggedSince(DEFAULT_USER_ID, startOfToday(now)),
        ]);
        await sendTelegramMessage(replyHabitsToday(schedules, new Set(loggedTypeIds), now));
        console.log("[Telegram Listener] Reported today's habits");
        break;
      }
      case 'brief': {
        // Same coaching engine as the scheduled briefs; slot follows the hour,
        // so a morning brief includes the yesterday review + 7-day habit metrics.
        const now = new Date();
        const message = await composeCoaching(missionRepo, habitRepo, DEFAULT_USER_ID, slotForHour(now.getHours()), now, streakService, planService);
        await sendTelegramMessage(message);
        console.log('[Telegram Listener] Sent on-demand brief');
        break;
      }
      case 'calendar_sync': {
        if (!(await googleCalendarService.isConnected(DEFAULT_USER_ID))) {
          const authUrl = (process.env.GOOGLE_OAUTH_REDIRECT_URI || '').replace('/callback', '');
          await sendTelegramMessage(
            `📅 Google Calendar belum terhubung.${authUrl ? `\nHubungkan di: ${authUrl}` : ''}`
          );
          break;
        }
        const result = await calendarSyncService.syncAll(DEFAULT_USER_ID);
        await sendTelegramMessage(composeCalendarSyncMessage(result));
        console.log(
          `[Telegram Listener] Calendar synced (${result.synced} events across ${result.calendars} calendar(s))`
        );
        break;
      }
      case 'calendar_view': {
        const events = await calendarEventRepo.list(DEFAULT_USER_ID, {
          from: new Date().toISOString(),
          category: intent.category ?? undefined,
          limit: 20,
        });
        await sendTelegramMessage(replyCalendarEvents(events, intent.category));
        console.log(`[Telegram Listener] Listed ${events.length} calendar event(s)`);
        break;
      }
    }
  } catch (err) {
    if (err instanceof AbortNeedsTargetError) {
      await sendTelegramMessage(replyAbortNeedsTarget(err.candidates)).catch(() => null);
      console.log('[Telegram Listener] Abort needs a target — asked which mission');
      return;
    }
    const message = (err as Error).message;
    console.warn(`[Telegram Listener] ${intent.kind} failed: ${message}`);
    await sendTelegramMessage(replyError(message)).catch(() => null);
  }
}

async function poll(offset: number): Promise<number> {
  const updates = await getTelegramUpdates(offset, POLL_TIMEOUT_SEC);
  let nextOffset = offset;

  for (const update of updates) {
    nextOffset = update.update_id + 1; // acknowledge even if we ignore the message
    const message = update.message;
    if (!message?.text) continue;
    if (!isAuthorizedChat(message.chat?.id)) {
      console.warn(`[Telegram Listener] Ignored message from unauthorized chat ${message.chat?.id}`);
      continue;
    }
    await handleText(message.text);
  }

  return nextOffset;
}

async function main(): Promise<void> {
  console.log('[Telegram Listener] Started — long-polling for mission messages');
  let offset = 0;

  // Continuous long-poll loop. getUpdates blocks server-side, so this is not a busy-wait.
  for (;;) {
    try {
      offset = await poll(offset);
    } catch (err) {
      console.error('[Telegram Listener] Poll error:', (err as Error).message);
      await new Promise(resolve => setTimeout(resolve, ERROR_BACKOFF_MS));
    }
  }
}

main().catch(err => {
  console.error('[Telegram Listener] Fatal startup error:', err);
  process.exit(1);
});
