/**
 * Compact V2 LLM response cache on pack.aiAnalysis.meta.llmCache
 * Key: contentHash|job|model|promptVersion
 */

const CACHE_ROOT_KEY = 'llmCache';
const MAX_CACHE_ENTRIES = 24;

function ensureCacheMap(container) {
  const next = container && typeof container === 'object' ? { ...container } : {};
  const meta = next.meta && typeof next.meta === 'object' ? { ...next.meta } : {};
  const llmCache =
    meta[CACHE_ROOT_KEY] && typeof meta[CACHE_ROOT_KEY] === 'object'
      ? { ...meta[CACHE_ROOT_KEY] }
      : {};
  meta[CACHE_ROOT_KEY] = llmCache;
  next.meta = meta;
  return { container: next, llmCache };
}

function buildCacheKey({ contentHash, job, model, promptVersion }) {
  return [contentHash || '', job || '', model || '', promptVersion || ''].join('|');
}

/**
 * @returns {{ hit: boolean, payload?: object, container: object }}
 */
function getLlmCache(container, keyParts) {
  const { container: next, llmCache } = ensureCacheMap(container);
  const key = buildCacheKey(keyParts);
  const entry = llmCache[key];
  if (!entry || typeof entry !== 'object' || entry.payload == null) {
    return { hit: false, container: next };
  }
  return { hit: true, payload: entry.payload, container: next, key };
}

/**
 * Store normalized job payload. Prunes oldest when over MAX_CACHE_ENTRIES.
 */
function setLlmCache(container, keyParts, payload) {
  const { container: next, llmCache } = ensureCacheMap(container);
  const key = buildCacheKey(keyParts);
  llmCache[key] = {
    payload,
    savedAt: new Date().toISOString(),
  };
  const keys = Object.keys(llmCache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const ranked = keys
      .map((k) => ({ k, t: Date.parse(llmCache[k]?.savedAt || 0) || 0 }))
      .sort((a, b) => a.t - b.t);
    const drop = ranked.slice(0, keys.length - MAX_CACHE_ENTRIES);
    for (const d of drop) delete llmCache[d.k];
  }
  next.meta = { ...next.meta, [CACHE_ROOT_KEY]: llmCache };
  return next;
}

function clearLlmCache(container) {
  const { container: next, llmCache } = ensureCacheMap(container);
  next.meta = { ...next.meta, [CACHE_ROOT_KEY]: {} };
  void llmCache;
  return next;
}

module.exports = {
  CACHE_ROOT_KEY,
  MAX_CACHE_ENTRIES,
  buildCacheKey,
  getLlmCache,
  setLlmCache,
  clearLlmCache,
  ensureCacheMap,
};
