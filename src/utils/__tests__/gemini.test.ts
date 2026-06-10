import { retryAsync, GeminiError } from '../gemini';

// Zero delay so the retry tests don't actually wait on backoff.
const NO_WAIT = { baseDelayMs: 0, maxDelayMs: 0 };
const alwaysRetry = () => true;

describe('retryAsync', () => {
  it('returns immediately on first success (no retries used)', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retryAsync(fn, { retries: 2, isRetryable: alwaysRetry, ...NO_WAIT })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new GeminiError('503', true))
      .mockRejectedValueOnce(new GeminiError('timeout', true))
      .mockResolvedValue('recovered');
    const onRetry = jest.fn();
    const out = await retryAsync(fn, { retries: 2, isRetryable: alwaysRetry, onRetry, ...NO_WAIT });
    expect(out).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured retries and throws the last error', async () => {
    const fn = jest.fn().mockRejectedValue(new GeminiError('503', true));
    await expect(
      retryAsync(fn, { retries: 2, isRetryable: alwaysRetry, ...NO_WAIT })
    ).rejects.toThrow('503');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry a non-retryable failure', async () => {
    const fn = jest.fn().mockRejectedValue(new GeminiError('bad request', false));
    await expect(
      retryAsync(fn, { retries: 5, isRetryable: e => e instanceof GeminiError && e.retryable, ...NO_WAIT })
    ).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
