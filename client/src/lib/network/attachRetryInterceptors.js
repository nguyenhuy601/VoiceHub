import {
  classifyFailure,
  shouldRetry,
  computeBackoffDelayMs,
  parseRetryAfterMs,
  retryPolicyDefaults,
  FAILURE_KIND,
} from './retryPolicy.js';
import { NETWORK_STATE } from './networkController.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyBrowserCacheFailure(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('cache') || msg.includes('err_cache');
}

/**
 * Attach offline gate (request) + transport retry (response) to an axios instance.
 * Auth 401 refresh remains in the caller's existing response interceptor — call
 * `tryTransportRetry` from that interceptor BEFORE business toast handling.
 *
 * @param {import('axios').AxiosInstance} axiosInstance
 * @param {{
 *   networkController: object,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   jitterMs?: number,
 * }} deps
 */
export function attachOfflineRequestGate(axiosInstance, deps) {
  const { networkController } = deps;
  axiosInstance.interceptors.request.use(
    (config) => {
      if (config?.__allowWhileOffline) return config;
      if (networkController.shouldBlockRequests()) {
        const err = new Error('NETWORK_OFFLINE');
        err.code = 'NETWORK_OFFLINE';
        err.config = config;
        err.isNetworkOffline = true;
        return Promise.reject(err);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
}

/**
 * Attempt transport-level retry for safe methods. Returns response data on success,
 * or null if caller should continue with normal error handling.
 *
 * @param {import('axios').AxiosError} error
 * @param {import('axios').AxiosInstance} axiosInstance
 * @param {{
 *   networkController: object,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   jitterMs?: number,
 * }} deps
 * @returns {Promise<*|null>}
 */
export async function tryTransportRetry(error, axiosInstance, deps) {
  const {
    networkController,
    maxAttempts = retryPolicyDefaults.maxAttempts,
    baseDelayMs = retryPolicyDefaults.baseDelayMs,
    maxDelayMs = retryPolicyDefaults.maxDelayMs,
    jitterMs = retryPolicyDefaults.jitterMs,
  } = deps;

  const config = error?.config;
  if (!config || config.__skipNetworkRetry) return null;

  if (error?.code === 'NETWORK_OFFLINE' || error?.isNetworkOffline) {
    networkController.markOffline?.();
    return null;
  }

  const kind = classifyFailure(error, {
    isOffline: networkController.getState() === NETWORK_STATE.OFFLINE,
  });

  if (kind === FAILURE_KIND.NETWORK || kind === FAILURE_KIND.TIMEOUT) {
    networkController.reportTransportFailure?.();
  }

  if (networkController.shouldBlockRequests()) {
    return null;
  }

  const method = String(config.method || 'get').toLowerCase();
  const attempt = Number(config.__transportRetryAttempt || 0);

  if (
    !shouldRetry({
      kind,
      method,
      attempt,
      maxAttempts,
      skipRetry: Boolean(config.__skipNetworkRetry),
    })
  ) {
    return null;
  }

  const retryAfterHeader =
    error.response?.headers?.['retry-after'] || error.response?.headers?.['Retry-After'];
  const delayMs = computeBackoffDelayMs(attempt, {
    baseDelayMs,
    maxDelayMs,
    jitterMs,
    retryAfterMs: kind === FAILURE_KIND.RATE_LIMIT_429 ? parseRetryAfterMs(retryAfterHeader) : null,
  });

  config.__transportRetryAttempt = attempt + 1;

  // Preserve legacy cache-bust behaviour for pure network/cache misses on first retry
  if (
    (kind === FAILURE_KIND.NETWORK || isLikelyBrowserCacheFailure(error)) &&
    !config.__cacheBustRetry
  ) {
    config.__cacheBustRetry = true;
    const prevHeaders =
      config.headers && typeof config.headers.toJSON === 'function'
        ? config.headers.toJSON()
        : { ...(config.headers || {}) };
    config.headers = {
      ...prevHeaders,
      'Cache-Control': 'no-store, no-cache',
      Pragma: 'no-cache',
    };
    config.params = { ...(config.params || {}), _nc: Date.now() };
  }

  await sleep(delayMs);

  if (networkController.shouldBlockRequests()) {
    return null;
  }

  try {
    const result = await axiosInstance.request(config);
    networkController.reportSuccess?.();
    return result;
  } catch (retryErr) {
    // Recurse via same helper so attempt counter on config accumulates
    const nested = await tryTransportRetry(retryErr, axiosInstance, deps);
    if (nested !== null && nested !== undefined) return nested;
    throw retryErr;
  }
}

/**
 * Report success on the happy path (call from response success interceptor).
 * @param {object} networkController
 */
export function attachSuccessReporter(axiosInstance, networkController) {
  axiosInstance.interceptors.response.use(
    (response) => {
      networkController.reportSuccess?.();
      return response;
    },
    (error) => Promise.reject(error)
  );
}
