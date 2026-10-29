/**
 * Per-snapshot RAG index manifest and document-vector cache.
 * Manifest lives on redis-lg when LG_REDIS_URL is set. Tests inject a memory store.
 * A cached vector is not the same as an indexed snapshot: callers still upsert into the target snapshot.
 */

const { runOnArtifactRedis, artifactRedisUrl } = require('../artifacts/artifactRedis');

const MANIFEST_PREFIX = 'vh:ai-plan:g7:manifest:';
const LOCK_PREFIX = 'vh:ai-plan:g7:lock:';
const VECTOR_PREFIX = 'vh:ai-plan:g7:vec:';
const ENTRY_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function manifestKey(snapshotId) {
  return `${MANIFEST_PREFIX}${String(snapshotId || '').trim()}`;
}

function lockKey(snapshotId) {
  return `${LOCK_PREFIX}${String(snapshotId || '').trim()}`;
}

function vectorKey(embeddingVersion, inputHash) {
  const version = String(embeddingVersion || '').replace(/[^\w.:-]/g, '') || 'embed';
  const hash = String(inputHash || '').replace(/[^a-f0-9]/gi, '');
  return `${VECTOR_PREFIX}${version}:${hash}`;
}

function createMemoryG7IndexStore() {
  const manifests = new Map();
  const vectors = new Map();
  const locks = new Map();

  return {
    async getManifest(snapshotId) {
      return manifests.get(String(snapshotId || '')) || null;
    },
    async putManifest(snapshotId, manifest) {
      manifests.set(String(snapshotId || ''), manifest);
      return true;
    },
    async getVector(embeddingVersion, inputHash) {
      const value = vectors.get(vectorKey(embeddingVersion, inputHash));
      return Array.isArray(value) ? value : null;
    },
    async putVector(embeddingVersion, inputHash, vector) {
      if (!Array.isArray(vector) || !vector.length) return false;
      vectors.set(vectorKey(embeddingVersion, inputHash), vector);
      return true;
    },
    async acquireLock(snapshotId, token, ttlMs) {
      const key = String(snapshotId || '');
      const now = Date.now();
      const current = locks.get(key);
      if (current && current.expires > now && current.token !== token) return false;
      locks.set(key, { token, expires: now + ttlMs });
      return true;
    },
    async releaseLock(snapshotId, token) {
      const key = String(snapshotId || '');
      const current = locks.get(key);
      if (current && current.token === token) locks.delete(key);
      return true;
    },
  };
}

function createRedisG7IndexStore(env) {
  async function readRaw(key) {
    const result = await runOnArtifactRedis(env, null, async (redis) => {
      const raw = await redis.get(key);
      return { ok: true, raw };
    });
    if (!result || result.ok === false) return undefined;
    return result.raw;
  }

  return {
    async getManifest(snapshotId) {
      const raw = await readRaw(manifestKey(snapshotId));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    },
    async putManifest(snapshotId, manifest) {
      const result = await runOnArtifactRedis(env, null, async (redis) => {
        await redis.set(manifestKey(snapshotId), JSON.stringify(manifest), 'PX', ENTRY_TTL_MS);
        return { ok: true };
      });
      return Boolean(result && result.ok !== false);
    },
    async getVector(embeddingVersion, inputHash) {
      const raw = await readRaw(vectorKey(embeddingVersion, inputHash));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length ? parsed : null;
      } catch {
        return null;
      }
    },
    async putVector(embeddingVersion, inputHash, vector) {
      if (!Array.isArray(vector) || !vector.length) return false;
      const result = await runOnArtifactRedis(env, null, async (redis) => {
        await redis.set(
          vectorKey(embeddingVersion, inputHash),
          JSON.stringify(vector),
          'PX',
          ENTRY_TTL_MS
        );
        return { ok: true };
      });
      return Boolean(result && result.ok !== false);
    },
    async acquireLock(snapshotId, token, ttlMs) {
      const result = await runOnArtifactRedis(env, null, async (redis) => {
        const set = await redis.set(lockKey(snapshotId), token, 'PX', ttlMs, 'NX');
        return { ok: true, claimed: set === 'OK' };
      });
      return Boolean(result && result.claimed);
    },
    async releaseLock(snapshotId, token) {
      await runOnArtifactRedis(env, null, async (redis) => {
        const current = await redis.get(lockKey(snapshotId));
        if (current === token) await redis.del(lockKey(snapshotId));
        return { ok: true };
      });
      return true;
    },
  };
}

let memoryFallback = null;

function resolveG7IndexStore(opts = {}) {
  if (opts.indexStore) return opts.indexStore;
  const env = opts.env || process.env;
  if (artifactRedisUrl(env)) return createRedisG7IndexStore(env);
  if (!memoryFallback) memoryFallback = createMemoryG7IndexStore();
  return memoryFallback;
}

module.exports = {
  createMemoryG7IndexStore,
  createRedisG7IndexStore,
  resolveG7IndexStore,
  manifestKey,
  vectorKey,
};
