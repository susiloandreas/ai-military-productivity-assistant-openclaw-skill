import https from 'https';

/**
 * Minimal Google Gemini (Generative Language API) text client — raw https, no
 * SDK, mirroring utils/telegram.ts. Kept behind this single function so the LLM
 * provider can be swapped without touching callers.
 *
 * Requires GEMINI_API_KEY. Model defaults to GEMINI_MODEL or 'gemini-2.5-pro'
 * (stronger model for higher-quality coaching; override via GEMINI_MODEL).
 */

export interface GeminiOptions {
  /** 0–1; higher = more varied. Coaching uses a high value for fresh phrasing. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Override the model id (else GEMINI_MODEL env, else gemini-2.5-flash). */
  model?: string;
}

export function generateText(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      reject(new Error('GEMINI_API_KEY must be set'));
      return;
    }
    const model = opts.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.9,
        // Generous cap so the model has room to elaborate; the prompt's sentence
        // guidance still controls the actual message length.
        maxOutputTokens: opts.maxOutputTokens ?? 800,
      },
    });

    const options: https.RequestOptions = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${key}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Gemini API error: HTTP ${res.statusCode} ${data.slice(0, 200)}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          const text: string | undefined = json?.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text ?? '')
            .join('')
            .trim();
          if (!text) {
            reject(new Error(`Gemini returned no text: ${data.slice(0, 200)}`));
            return;
          }
          resolve(text);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.setTimeout(30000, () => req.destroy(new Error('Gemini request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
