/**
 * Thin Qdrant REST client (axios) — no extra npm dep.
 */

const axios = require('axios');

const DEFAULT_COLLECTION = 'vh_ai_plan_g7';

function qdrantBaseUrl(env = process.env) {
  return String(env.QDRANT_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function collectionName(env = process.env) {
  return (
    String(env.QDRANT_COLLECTION || DEFAULT_COLLECTION).trim() || DEFAULT_COLLECTION
  );
}

function createQdrantClient(opts = {}) {
  const env = opts.env || process.env;
  const http = opts.axiosImpl || axios;
  const base = qdrantBaseUrl(env);
  const collection = collectionName(env);

  function assertConfigured() {
    if (!base) {
      const err = new Error('QDRANT_URL is not set');
      err.code = 'QDRANT_URL_MISSING';
      throw err;
    }
    return base;
  }

  async function ensureCollection(vectorSize) {
    const root = assertConfigured();
    const getRes = await http.get(`${root}/collections/${encodeURIComponent(collection)}`, {
      validateStatus: () => true,
      timeout: 10000,
    });
    if (getRes.status === 200) return { created: false, collection };
    const putRes = await http.put(
      `${root}/collections/${encodeURIComponent(collection)}`,
      {
        vectors: {
          size: Number(vectorSize) || 768,
          distance: 'Cosine',
        },
      },
      { validateStatus: () => true, timeout: 15000 }
    );
    if (putRes.status >= 200 && putRes.status < 300) {
      return { created: true, collection };
    }
    const err = new Error(`Qdrant ensureCollection failed: ${putRes.status}`);
    err.code = 'QDRANT_ENSURE_FAILED';
    err.status = putRes.status;
    throw err;
  }

  async function upsertPoints(points) {
    const root = assertConfigured();
    const res = await http.put(
      `${root}/collections/${encodeURIComponent(collection)}/points?wait=true`,
      { points: Array.isArray(points) ? points : [] },
      { validateStatus: () => true, timeout: 60000 }
    );
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`Qdrant upsert failed: ${res.status}`);
      err.code = 'QDRANT_UPSERT_FAILED';
      err.status = res.status;
      throw err;
    }
    return res.data;
  }

  async function search({ vector, snapshotId, limit = 8 }) {
    const root = assertConfigured();
    const sid = String(snapshotId || '').trim();
    if (!sid) {
      const err = new Error('snapshotId required for Qdrant search');
      err.code = 'SNAPSHOT_BIND_REQUIRED';
      throw err;
    }
    const res = await http.post(
      `${root}/collections/${encodeURIComponent(collection)}/points/search`,
      {
        vector,
        limit: Number(limit) || 8,
        with_payload: true,
        filter: {
          must: [{ key: 'snapshotId', match: { value: sid } }],
        },
      },
      { validateStatus: () => true, timeout: 30000 }
    );
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`Qdrant search failed: ${res.status}`);
      err.code = 'QDRANT_SEARCH_FAILED';
      err.status = res.status;
      throw err;
    }
    return Array.isArray(res.data?.result) ? res.data.result : [];
  }

  return {
    base,
    collection,
    ensureCollection,
    upsertPoints,
    search,
  };
}

module.exports = {
  createQdrantClient,
  qdrantBaseUrl,
  collectionName,
  DEFAULT_COLLECTION,
};
