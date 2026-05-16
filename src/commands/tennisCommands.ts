import { TennisService } from '../services/TennisService';
import { TennisSessionType } from '../types';
import { formatSuccess, formatError, formatBlock } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';

const VALID_SESSION_TYPES: TennisSessionType[] = [
  'serve', 'footwork', 'rally', 'endurance', 'match', 'other',
];

/**
 * /tennis start <session_type> [--eta <duration>]
 * /tennis log <session_type> <duration> [--notes <text>]
 * /tennis summary
 */
export async function handleTennisCommand(
  args: string[],
  userId: string,
  service: TennisService
): Promise<string> {
  const sub = args[0];

  try {
    switch (sub) {
      case 'start': {
        const rest = args.slice(1);
        const eta = extractFlag(rest, '--eta');
        const sessionType = rest[0] as TennisSessionType;
        if (!VALID_SESSION_TYPES.includes(sessionType)) {
          return formatError(
            `Invalid session type. Valid: ${VALID_SESSION_TYPES.join(', ')}`
          );
        }
        const { missionId } = await service.startSession(userId, sessionType, eta);
        const lines = [`Type: ${sessionType}`, `Mission ID: ${missionId}`];
        if (eta) lines.push(`ETA: ${eta}`);
        return formatSuccess('TENNIS SESSION STARTED', lines);
      }

      case 'log': {
        const rest = args.slice(1);
        const notes = extractFlag(rest, '--notes');
        const [sessionTypeStr, durationStr] = rest;
        const sessionType = sessionTypeStr as TennisSessionType;
        if (!VALID_SESSION_TYPES.includes(sessionType)) {
          return formatError(
            `Invalid session type. Valid: ${VALID_SESSION_TYPES.join(', ')}`
          );
        }
        if (!durationStr) return formatError('Duration required. Usage: /tennis log <type> <duration>');
        const { trainingLog } = await service.completeSession(
          userId,
          sessionType,
          durationStr,
          notes ?? undefined
        );
        return formatSuccess('TENNIS SESSION LOGGED', [
          `Type: ${trainingLog.session_type}`,
          `Duration: ${formatMinutes(trainingLog.duration_minutes)}`,
        ]);
      }

      case 'summary': {
        const { sessions, totalMinutes } = await service.getWeeklySummary(userId);
        if (sessions.length === 0) {
          return formatSuccess('TENNIS SUMMARY', ['No sessions this week.']);
        }
        const lines = sessions.map(
          s =>
            `${s.session_type}: ${formatMinutes(Number(s.total_minutes))} (${s.session_count}x)`
        );
        lines.push(`─── TOTAL: ${formatMinutes(totalMinutes)}`);
        return formatBlock('TENNIS WEEKLY SUMMARY', [{ label: 'BY TYPE', lines }]);
      }

      default:
        return formatError('Usage: /tennis start | /tennis log | /tennis summary');
    }
  } catch (err) {
    return formatError((err as Error).message);
  }
}

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return null;
  const [, value] = args.splice(idx, 2);
  return value;
}
