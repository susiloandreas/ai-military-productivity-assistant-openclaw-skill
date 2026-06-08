import https from 'https';

/**
 * Sends a plain-text or HTML message to the configured Telegram chat.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 */
export function sendTelegramMessage(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      reject(new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set'));
      return;
    }

    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });

    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      // consume response body to free the socket
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Telegram API error: HTTP ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** A single incoming Telegram update (only the fields this service consumes). */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

/**
 * Long-poll the Telegram getUpdates API. Returns updates with update_id >= offset.
 * The HTTP call blocks server-side up to `timeoutSec`, returning early when
 * messages arrive — pass the previous `update_id + 1` as `offset` to acknowledge
 * already-processed updates. Requires TELEGRAM_BOT_TOKEN.
 */
export function getTelegramUpdates(offset: number, timeoutSec = 30): Promise<TelegramUpdate[]> {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      reject(new Error('TELEGRAM_BOT_TOKEN must be set'));
      return;
    }

    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/getUpdates?offset=${offset}&timeout=${timeoutSec}`,
      method: 'GET',
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data) as { ok: boolean; result?: TelegramUpdate[] };
            resolve(json.result ?? []);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`Telegram API error: HTTP ${res.statusCode}`));
        }
      });
    });

    // Guard the socket: allow a little slack beyond the server-side long-poll window.
    req.setTimeout((timeoutSec + 10) * 1000, () => {
      req.destroy(new Error('getUpdates request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}
