/**
 * Browser connectivity state machine for HTTP clients and pollers.
 * ONLINE → OFFLINE → RECONNECTING → ONLINE
 */

export const NETWORK_STATE = Object.freeze({
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  RECONNECTING: 'RECONNECTING',
});

/** Consecutive transport failures before forcing OFFLINE while navigator still says online */
const FAIL_BURST_THRESHOLD = 3;

/** Window for counting fail burst (ms) */
const FAIL_BURST_WINDOW_MS = 15_000;

function readNavigatorOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * @param {{
 *   getOnline?: () => boolean,
 *   failBurstThreshold?: number,
 *   failBurstWindowMs?: number,
 * }} [opts]
 */
export function createNetworkController(opts = {}) {
  const getOnline = opts.getOnline || readNavigatorOnline;
  const failBurstThreshold = opts.failBurstThreshold ?? FAIL_BURST_THRESHOLD;
  const failBurstWindowMs = opts.failBurstWindowMs ?? FAIL_BURST_WINDOW_MS;

  let state = getOnline() ? NETWORK_STATE.ONLINE : NETWORK_STATE.OFFLINE;
  const listeners = new Set();
  /** @type {number[]} */
  let failTimestamps = [];
  let started = false;

  function emit() {
    for (const fn of listeners) {
      try {
        fn(state);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  function setState(next) {
    if (next === state) return;
    state = next;
    if (next === NETWORK_STATE.ONLINE) {
      failTimestamps = [];
    }
    emit();
  }

  function onBrowserOffline() {
    failTimestamps = [];
    setState(NETWORK_STATE.OFFLINE);
  }

  function onBrowserOnline() {
    if (state === NETWORK_STATE.OFFLINE || state === NETWORK_STATE.RECONNECTING) {
      setState(NETWORK_STATE.RECONNECTING);
    }
  }

  return {
    getState() {
      return state;
    },

    isOnline() {
      return state === NETWORK_STATE.ONLINE;
    },

    isOffline() {
      return state === NETWORK_STATE.OFFLINE;
    },

    /** True when requests should not be sent (OFFLINE only; RECONNECTING allows probe/retry). */
    shouldBlockRequests() {
      return state === NETWORK_STATE.OFFLINE;
    },

    /** True when pollers should pause (OFFLINE or waiting to confirm). */
    shouldPausePolling() {
      return state === NETWORK_STATE.OFFLINE;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Record a transport-level network failure (no HTTP response).
     * May transition ONLINE → OFFLINE after a burst.
     */
    reportTransportFailure() {
      if (state === NETWORK_STATE.OFFLINE) return;
      const now = Date.now();
      failTimestamps = failTimestamps.filter((t) => now - t <= failBurstWindowMs);
      failTimestamps.push(now);
      if (!getOnline() || failTimestamps.length >= failBurstThreshold) {
        setState(NETWORK_STATE.OFFLINE);
      }
    },

    /** Successful HTTP response — confirm ONLINE from RECONNECTING. */
    reportSuccess() {
      if (state === NETWORK_STATE.RECONNECTING || state === NETWORK_STATE.OFFLINE) {
        setState(NETWORK_STATE.ONLINE);
      } else {
        failTimestamps = [];
      }
    },

    /** Explicitly mark reconnecting after online event (tests / manual). */
    markReconnecting() {
      setState(NETWORK_STATE.RECONNECTING);
    },

    markOffline() {
      setState(NETWORK_STATE.OFFLINE);
    },

    markOnline() {
      setState(NETWORK_STATE.ONLINE);
    },

    /** Bind window online/offline listeners once (browser). */
    start() {
      if (started || typeof window === 'undefined') return () => {};
      started = true;
      if (!getOnline()) {
        setState(NETWORK_STATE.OFFLINE);
      }
      window.addEventListener('offline', onBrowserOffline);
      window.addEventListener('online', onBrowserOnline);
      return () => {
        window.removeEventListener('offline', onBrowserOffline);
        window.removeEventListener('online', onBrowserOnline);
        started = false;
      };
    },
  };
}

/** App singleton */
export const networkController = createNetworkController();

/** Ensure browser listeners are attached (idempotent). */
export function ensureNetworkControllerStarted() {
  return networkController.start();
}
