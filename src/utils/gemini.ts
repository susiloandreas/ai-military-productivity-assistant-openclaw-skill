import https from 'https';

/**
 * Minimal Google Gemini (Generative Language API) text client — raw https, no
 * SDK, mirroring utils/telegram.ts. Kept behind this single function so the LLM
 * provider can be swapped without touching callers.
 *
 * Requires GEMINI_API_KEY. Model defaults to GEMINI_MODEL or 'gemini-2.5-pro'
 * (stronger model for higher-quality coaching; override via GEMINI_MODEL).
 *
 * Each request has a per-attempt timeout and is retried with exponential backoff
 * on transient failures (timeouts, network errors, HTTP 408/429/5xx), so a slow
 * or briefly-unavailable API no longer drops straight to the static fallback.
 */

export interface GeminiOptions {
  /** 0–1; higher = more varied. Coaching uses a high value for fresh phrasing. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Override the model id (else GEMINI_MODEL env, else gemini-2.5-pro). */
  model?: string;
  /** Per-attempt timeout in ms. Default GEMINI_TIMEOUT_MS env, else 60000. */
  timeoutMs?: number;
  /** Extra attempts after the first. Default GEMINI_RETRIES env, else 2. */
  retries?: number;
}

/** HTTP statuses worth retrying — transient/overload conditions. */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Error carrying whether the failure is worth retrying. */
export class GeminiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'GeminiError';
  }
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on failures `isRetryable` accepts, up to `retries` extra
 * attempts, with exponential backoff + jitter. Pure of any network concern so
 * the retry policy is unit-testable. Throws the last error once attempts run out.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: {
    retries: number;
    isRetryable: (err: unknown) => boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
  }
): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  let lastErr: unknown = new Error('not attempted');

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.retries || !opts.isRetryable(err)) break;
      const delay = Math.min(max, base * 2 ** attempt) + Math.floor(Math.random() * 250);
      opts.onRetry?.(attempt + 1, err, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** A single Gemini call (one attempt). Rejects with a GeminiError. */
function requestOnce(prompt: string, key: string, model: string, opts: GeminiOptions): Promise<string> {
  return new Promise((resolve, reject) => {
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
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new GeminiError(`Gemini API error: HTTP ${status} ${data.slice(0, 200)}`, RETRYABLE_STATUS.has(status)));
          return;
        }
        try {
          const json = JSON.parse(data);
          const text: string | undefined = json?.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text ?? '')
            .join('')
            .trim();
          if (!text) {
            // Empty completion isn't worth retrying — same prompt → same result.
            reject(new GeminiError(`Gemini returned no text: ${data.slice(0, 200)}`, false));
            return;
          }
          resolve(text);
        } catch (err) {
          reject(new GeminiError(`Gemini parse error: ${(err as Error).message}`, false));
        }
      });
    });

    const timeoutMs = opts.timeoutMs ?? envInt('GEMINI_TIMEOUT_MS', 60000);
    req.setTimeout(timeoutMs, () =>
      req.destroy(new GeminiError(`Gemini request timed out after ${timeoutMs}ms`, true))
    );
    // Network/socket errors (incl. the timeout destroy above) — transient, retry.
    req.on('error', err =>
      reject(err instanceof GeminiError ? err : new GeminiError(`Gemini request failed: ${(err as Error).message}`, true))
    );
    req.write(body);
    req.end();
  });
}

export async function generateText(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY must be set');
  const model = opts.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
  const retries = opts.retries ?? envInt('GEMINI_RETRIES', 2);

  return retryAsync(() => requestOnce(prompt, key, model, opts), {
    retries,
    isRetryable: err => (err instanceof GeminiError ? err.retryable : true),
    onRetry: (attempt, err, delay) =>
      console.warn(
        `[Gemini] attempt ${attempt}/${retries + 1} failed (${(err as Error).message}); retrying in ${delay}ms`
      ),
  });
}
