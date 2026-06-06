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
