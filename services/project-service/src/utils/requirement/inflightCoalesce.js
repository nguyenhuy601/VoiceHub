/**
 * Share one in-flight Promise per key so parallel callers (sidebar + page, StrictMode)
 * do not fan out duplicate S2S work.
 */
function createInflightCoalesce() {
  const inflight = new Map();

  return function coalesce(key, factory) {
    const k = String(key || '');
    const existing = inflight.get(k);
    if (existing) return existing;
    const pending = Promise.resolve().then(factory);
    inflight.set(k, pending);
    pending.finally(() => {
      if (inflight.get(k) === pending) inflight.delete(k);
    });
    return pending;
  };
}

module.exports = { createInflightCoalesce };
