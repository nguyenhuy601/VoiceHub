/**
 * Pure S2S GET retry helper — exponential backoff + jitter.
 * NEVER use for POST/PUT/PATCH/DELETE (mutations).
 * Layer ownership: Service may retry external GET; Gateway must not retry business POST.
 */

const SAFE = new Set(['get', 'head']);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableAxiosError(error) {
  const status = error?.response?.status;
  if (status === 429 || (status != null && status >= 500)) return true;
  if (error?.response) return false;
  const code = String(error?.code || '');
  return (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ERR_NETWORK' ||
    !error?.response
  );
}

/**
 * @param {() => Promise<import('axios').AxiosResponse>} requestFn
 * @param {{
 *   method?: string,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   jitterMs?: number,
 * }} [opts]
 */
async function withSafeGetRetry(requestFn, opts = {}) {
  const method = String(opts.method || 'get').toLowerCase();
  if (!SAFE.has(method)) {
    return requestFn();
  }
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const jitterMs = opts.jitterMs ?? 300;

  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await requestFn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableAxiosError(err) || attempt + 1 >= maxAttempts) {
        throw err;
      }
      const retryAfter = err.response?.headers?.['retry-after'];
      let delay;
      if (retryAfter != null && Number.isFinite(Number(retryAfter))) {
        delay = Math.min(maxDelayMs, Number(retryAfter) * 1000);
      } else {
        delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      }
      delay += Math.floor(Math.random() * jitterMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = {
  withSafeGetRetry,
  isRetryableAxiosError,
};
