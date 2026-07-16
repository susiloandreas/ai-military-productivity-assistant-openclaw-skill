import { parseIntent, parseExpiryStatusReply, ParsedIntent } from '../nlp/missionParser';
import { parsePlanEdit, PlanEditIntent } from '../nlp/planParser';
import { Mission } from '../types';

/**
 * Pure conversation-state router for the Telegram listener. `handleText` used
 * to interleave state detection (pending confirmation? awaiting notes? which
 * kind?) with side effects (DB writes, Telegram sends) in one long run of
 * nested `if`s — impossible to unit-test without mocking Postgres/Redis/
 * Telegram for every branch.
 *
 * This module pulls the *decision* out as a plain function: given the incoming
 * text and the two pieces of state that actually matter (a pending mission
 * confirmation, a mission awaiting notes), it returns one `Action` describing
 * what should happen. `TelegramListenerWorker` becomes a thin executor that
 * switches on the action and performs the I/O — every routing rule is testable
 * as `route(text, pending, awaiting) → expected action`, no mocks required.
 */

/** The conflicting calendar event, offered as an alternative to start instead. */
export interface PendingCalendarEvent {
  title: string;
  categoryName: string | null;
  /** ISO end time, used to size the mission's ETA when started. */
  endsAt: string | null;
}

export interface PendingMission {
  title: string;
  etaStr: string | null;
  categoryName: string | null;
  createdAt: number;
  /** When the mission was held back by a calendar clash, the clashing event. */
  calendarEvent?: PendingCalendarEvent;
}

export type Action =
  /** Bare "ya"/"gas"/etc. confirms a mission held back by a calendar conflict. */
  | { type: 'confirm_pending'; pending: PendingMission }
  /** "kalender" instead — start the clashing calendar event as the mission. */
  | { type: 'confirm_calendar'; event: PendingCalendarEvent }
  /** ETA-expired reply carried no recognizable status at all — ask for one. */
  | { type: 'expiry_needs_status' }
  /**
   * ETA-expired reply named a status — close it out. Notes are optional here:
   * when the reply is bare ("selesai" with no notes), `notes` is '' and the
   * executor re-opens the awaiting-notes prompt so the next free-text message
   * is captured, same as a normal completion.
   */
  | { type: 'resolve_expired'; missionId: string; completed: boolean; notes: string }
  /** "perpanjang <durasi>" while ETA-expired, with a duration given. */
  | { type: 'extend_expired'; missionId: string; extendStr: string }
  /** "perpanjang" while ETA-expired but no duration given. */
  | { type: 'needs_extend_duration' }
  /** A real command arrived while ETA-expired-awaiting — drop the prompt, then run it. */
  | { type: 'expiry_command'; missionId: string; intent: ParsedIntent }
  /** Free-text reply after a normal completion — captured as the mission's notes. */
  | { type: 'record_notes'; missionId: string; notes: string }
  /** A real command arrived while notes were pending — drop the prompt, then run it. */
  | { type: 'notes_command'; missionId: string; intent: ParsedIntent }
  /** No mission intent, but it parses as a plan view/draft/edit/accept/reject. */
  | { type: 'plan_edit'; edit: PlanEditIntent }
  /** Not a recognized request in any state — stay silent. */
  | { type: 'silent' }
  /** An ordinary mission command (start/complete/abort/extend/status/...). */
  | { type: 'command'; intent: ParsedIntent };

const CONFIRMATION_RE = /^(ya|yes|ok|oke|yak|lanjut|gas|go)\b/i;
// "start the calendar event instead" — only meaningful while a calendar clash is
// pending, so it can safely overload "kalender" (which is otherwise a list view).
const CALENDAR_CONFIRM_RE = /^(ikuti?\s+)?(kalender|calendar|agenda|jadwal)\b|^(sesuai|ikuti?)\s+(jadwal|kalender)\b/i;

/**
 * Decide what the incoming message means given the two live pieces of
 * conversation state. Pure — no DB or Telegram access — so every rule is a
 * one-line assertion in tests.
 */
export function route(
  text: string,
  pendingMission: PendingMission | null,
  awaitingMission: Mission | null
): Action {
  const intent = parseIntent(text);
  const trimmed = text.trim();

  if (pendingMission) {
    // "kalender" → start the clashing event instead. Checked before parseIntent's
    // calendar_view so it wins while a conflict is pending.
    if (pendingMission.calendarEvent && CALENDAR_CONFIRM_RE.test(trimmed)) {
      return { type: 'confirm_calendar', event: pendingMission.calendarEvent };
    }
    if (!intent && CONFIRMATION_RE.test(trimmed)) {
      return { type: 'confirm_pending', pending: pendingMission };
    }
  }

  if (awaitingMission) {
    if (awaitingMission.status === 'eta_expired') {
      const { status, notes } = parseExpiryStatusReply(text);
      if (status) {
        return {
          type: 'resolve_expired',
          missionId: awaitingMission.id,
          completed: status === 'completed',
          notes,
        };
      }
      if (intent?.kind === 'extend') {
        return intent.extendStr
          ? { type: 'extend_expired', missionId: awaitingMission.id, extendStr: intent.extendStr }
          : { type: 'needs_extend_duration' };
      }
      if (!intent) return { type: 'expiry_needs_status' };
      return { type: 'expiry_command', missionId: awaitingMission.id, intent };
    }

    if (!intent) {
      return { type: 'record_notes', missionId: awaitingMission.id, notes: text.trim() };
    }
    return { type: 'notes_command', missionId: awaitingMission.id, intent };
  }

  if (!intent) {
    const planEdit = parsePlanEdit(text);
    return planEdit ? { type: 'plan_edit', edit: planEdit } : { type: 'silent' };
  }

  return { type: 'command', intent };
}
