import 'dotenv/config';
import { CalendarEventRepository } from '../repositories/CalendarEventRepository';
import { GoogleTokenRepository } from '../repositories/GoogleTokenRepository';
import { GoogleCalendarService } from '../services/GoogleCalendarService';
import { CalendarSyncService } from '../services/CalendarSyncService';
import { sendTelegramMessage } from '../utils/telegram';
import { composeCalendarSyncMessage } from './composeCalendarSync';
import { DEFAULT_USER_ID } from '../types';

// How often to mirror all Google calendars. Configurable; floored at 5 min so a
// misconfig can't hammer the Calendar API. Default: every 3 hours.
const INTERVAL_MS = Math.max(5, Number(process.env.CALENDAR_SYNC_INTERVAL_MIN) || 180) * 60 * 1000;

const tokenRepo = new GoogleTokenRepository();
const calendarService = new GoogleCalendarService(tokenRepo);
const syncService = new CalendarSyncService(new CalendarEventRepository(), calendarService);

async function runSync(): Promise<void> {
  const now = new Date();

  // Stay silent until the user has completed the OAuth handshake — otherwise this
  // would throw and (worse) spam Telegram every interval before Google is linked.
  if (!(await calendarService.isConnected(DEFAULT_USER_ID))) {
    console.log(`[Calendar Sync] ${now.toISOString()} — Google not connected yet, skipping`);
    return;
  }

  const result = await syncService.syncAll(DEFAULT_USER_ID);
  console.log(
    `[Calendar Sync] ${now.toISOString()} — ${result.synced} synced, ${result.pruned} pruned ` +
      `across ${result.calendars} calendar(s)`
  );

  await sendTelegramMessage(composeCalendarSyncMessage(result)).catch(err =>
    console.warn(`[Calendar Sync] Telegram send failed: ${(err as Error).message}`)
  );
}

async function main(): Promise<void> {
  console.log(`[Calendar Sync] Worker started — sync every ${INTERVAL_MS / 60000} min`);
  // Run once on boot, then on the interval.
  await runSync().catch(err => console.error('[Calendar Sync] Sync failed:', err));
  setInterval(() => {
    runSync().catch(err => console.error('[Calendar Sync] Sync failed:', err));
  }, INTERVAL_MS);
}

main().catch(err => {
  console.error('[Calendar Sync] Fatal startup error:', err);
  process.exit(1);
});
