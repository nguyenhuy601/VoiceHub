/**
 * Central HTTP retry classification + exponential backoff with jitter.
 * Mutations (POST/PUT/PATCH/DELETE) never auto-retry at transport layer.
 */

export const FAILURE_KIND = Object.freeze({
  BUSINESS_4XX: 'BUSINESS_4XX',
  AUTH_401: 'AUTH_401',
  RATE_LIMIT_429: 'RATE_LIMIT_429',
  TRANSIENT_5XX: 'TRANSIENT_5XX',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN',
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);

const DEFAULTS = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 16_000,
  jitterMs: 400,
});

/**
 * @param {import('axios').AxiosError|object} error
 * @param {{ isOffline?: boolean }} [ctx]
 */
export function classifyFailure(error, ctx = {}) {
  if (ctx.isOffline || error?.code === 'NETWORK_OFFLINE') {
    return FAILURE_KIND.OFFLINE;
  }

  const status = error?.response?.status;
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();

  if (status === 401) return FAILURE_KIND.AUTH_401;
  if (status === 429) return FAILURE_KIND.RATE_LIMIT_429;
  if (status != null && status >= 400 && status < 500) return FAILURE_KIND.BUSINESS_4XX;
  if (status != null && status >= 500) return FAILURE_KIND.TRANSIENT_5XX;

  if (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    msg.includes('timeout')
  ) {
    return FAILURE_KIND.TIMEOUT;
  }

  if (
    code === 'ERR_NETWORK' ||
    code === 'ERR_EMPTY_RESPONSE' ||
    msg.includes('network error') ||
    msg.includes('empty_response') ||
    msg.includes('err_cache') ||
    msg.includes('cache')
  ) {
    return FAILURE_KIND.NETWORK;
  }

  if (!error?.response) return FAILURE_KIND.NETWORK;
  return FAILURE_KIND.UNKNOWN;
}

export function isSafeHttpMethod(method) {
  return SAFE_METHODS.has(String(method || 'get').toLowerCase());
}

/**
 * @param {{
 *   kind: string,
 *   method?: string,
 *   attempt?: number,
 *   maxAttempts?: number,
 *   skipRetry?: boolean,
 * }} opts
 */
export function shouldRetry(opts) {
  const {
    kind,
    method = 'get',
    attempt = 0,
    maxAttempts = DEFAULTS.maxAttempts,
    skipRetry = false,
  } = opts;

  if (skipRetry) return false;
  if (kind === FAILURE_KIND.OFFLINE) return false;
  if (kind === FAILURE_KIND.BUSINESS_4XX) return false;
  if (kind === FAILURE_KIND.AUTH_401) return false;
  if (kind === FAILURE_KIND.UNKNOWN) return false;

  if (!isSafeHttpMethod(method)) return false;

  // attempt is 0-based count of completed failures; retry while attempt+1 < maxAttempts
  if (attempt + 1 >= maxAttempts) return false;

  return (
    kind === FAILURE_KIND.TRANSIENT_5XX ||
    kind === FAILURE_KIND.TIMEOUT ||
    kind === FAILURE_KIND.NETWORK ||
    kind === FAILURE_KIND.RATE_LIMIT_429
  );
}

/**
 * @param {number} attempt 0-based
 * @param {{
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   jitterMs?: number,
 *   retryAfterMs?: number|null,
 *   random?: () => number,
 * }} [opts]
 */
export function computeBackoffDelayMs(attempt, opts = {}) {
  const baseDelayMs = opts.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const jitterMs = opts.jitterMs ?? DEFAULTS.jitterMs;
  const random = opts.random || Math.random;

  if (opts.retryAfterMs != null && Number.isFinite(opts.retryAfterMs) && opts.retryAfterMs >= 0) {
    const jitter = Math.floor(random() * jitterMs);
    return Math.min(maxDelayMs, opts.retryAfterMs) + jitter;
  }

  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  const jitter = Math.floor(random() * jitterMs);
  return exp + jitter;
}

/**
 * Parse Retry-After header (seconds or HTTP-date).
 * @param {string|number|undefined|null} header
 * @returns {number|null} ms
 */
export function parseRetryAfterMs(header) {
  if (header == null || header === '') return null;
  const asNum = Number(header);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.round(asNum * 1000);
  }
  const dateMs = Date.parse(String(header));
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

export const retryPolicyDefaults = DEFAULTS;
