/**
 * Process-local TTL cache with in-flight promise coalesce.
 * @param {{ ttlMs?: number }} [opts]
 */
function createTtlCoalesceCache({ ttlMs = 15_000 } = {}) {
  let ttl = Math.max(0, Number(ttlMs) || 0);
  /** @type {Map<string, { value: unknown, expiresAt: number }>} */
  const entries = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const pending = new Map();

  async function getOrLoad(key, loader) {
    const k = String(key || '');
    if (!k) return loader();

    const now = Date.now();
    const hit = entries.get(k);
    if (hit && hit.expiresAt > now) return hit.value;

    const inflight = pending.get(k);
    if (inflight) return inflight;

    const promise = Promise.resolve()
      .then(() => loader())
      .then((value) => {
        if (ttl > 0) {
          entries.set(k, { value, expiresAt: Date.now() + ttl });
        }
        return value;
      })
      .finally(() => {
        pending.delete(k);
      });

    pending.set(k, promise);
    return promise;
  }

  function clear() {
    entries.clear();
    pending.clear();
  }

  /** Drop entries whose key matches predicate (sync; does not cancel in-flight). */
  function invalidateWhere(predicate) {
    if (typeof predicate !== 'function') return;
    for (const k of [...entries.keys()]) {
      if (predicate(k)) entries.delete(k);
    }
  }

  function deleteKey(key) {
    const k = String(key || '');
    if (k) entries.delete(k);
  }

  function setTtlMs(nextTtlMs) {
    ttl = Math.max(0, Number(nextTtlMs) || 0);
  }

  function size() {
    return entries.size;
  }

  return { getOrLoad, clear, setTtlMs, size, invalidateWhere, deleteKey };
}

module.exports = { createTtlCoalesceCache };
