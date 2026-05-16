import { SleepService } from '../services/SleepService';
import { formatSuccess, formatError, formatStatus } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';
import { parseDurationToMinutes } from '../utils/duration';

const QUALITY_VALUES = ['poor', 'fair', 'good', 'excellent'] as const;
type SleepQuality = typeof QUALITY_VALUES[number];

/**
 * /sleep log <duration> [--quality <poor|fair|good|excellent>] [--wake HH:MM] [--notes <text>]
 * /sleep status
 */
export async function handleSleepCommand(
  args: string[],
  userId: string,
  service: SleepService
): Promise<string> {
  const sub = args[0];

  try {
    switch (sub) {
      case 'log': {
        const rest = args.slice(1);
        const qualityStr = extractFlag(rest, '--quality');
        const wakeStr = extractFlag(rest, '--wake');
        const notes = extractFlag(rest, '--notes');
        const durationStr = rest[0];
        if (!durationStr) return formatError('Duration required. Usage: /sleep log <duration>');

        const durationMinutes = parseDurationToMinutes(durationStr);
        let quality: SleepQuality | null = null;
        if (qualityStr) {
          if (!QUALITY_VALUES.includes(qualityStr as SleepQuality)) {
            return formatError(`Invalid quality. Use: ${QUALITY_VALUES.join(', ')}`);
          }
          quality = qualityStr as SleepQuality;
        }

        let wakeTime: Date | null = null;
        if (wakeStr) {
          const [hh, mm] = wakeStr.split(':').map(Number);
          if (!isNaN(hh) && !isNaN(mm)) {
            wakeTime = new Date();
            wakeTime.setHours(hh, mm, 0, 0);
          }
        }

        const { log, debtMinutes, averageQuality } = await service.log(
          userId,
          durationMinutes,
          wakeTime,
          quality,
          notes ?? undefined
        );

        const readiness = service.getReadinessLabel(debtMinutes, averageQuality);
        const h = Math.floor(log.duration_minutes / 60);
        const m = log.duration_minutes % 60;

        return formatSuccess('SLEEP LOGGED', [
          `Duration: ${h}h ${m}m`,
          `Quality: ${log.sleep_quality ?? 'not set'}`,
          `Sleep debt: ${formatMinutes(debtMinutes)}`,
          `Readiness: ${readiness}`,
        ]);
      }

      case 'status': {
        const { lastLog, debtMinutes, averageQuality } = await service.getStatus(userId);
        const readiness = service.getReadinessLabel(debtMinutes, averageQuality);
        if (!lastLog) {
          return formatStatus('SLEEP STATUS', {
            'Last sleep': 'Not logged',
            Readiness: readiness,
          });
        }
        const h = Math.floor(lastLog.duration_minutes / 60);
        const m = lastLog.duration_minutes % 60;
        return formatStatus('SLEEP STATUS', {
          'Last sleep': `${h}h ${m}m`,
          Quality: lastLog.sleep_quality ?? 'N/A',
          '7-day debt': formatMinutes(debtMinutes),
          'Avg quality': `${averageQuality}/4`,
          Readiness: readiness,
        });
      }

      default:
        return formatError('Usage: /sleep log <duration> | /sleep status');
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
