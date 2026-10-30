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
    if (getRes.status === 200) {
      await ensurePayloadIndex();
      return { created: false, collection };
    }
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
      await ensurePayloadIndex();
      return { created: true, collection };
    }
    const err = new Error(`Qdrant ensureCollection failed: ${putRes.status}`);
    err.code = 'QDRANT_ENSURE_FAILED';
    err.status = putRes.status;
    throw err;
  }

  async function ensurePayloadIndex(field = 'snapshotId') {
    const root = assertConfigured();
    const res = await http.put(
      `${root}/collections/${encodeURIComponent(collection)}/index?wait=true`,
      { field_name: field, field_schema: 'keyword' },
      { validateStatus: () => true, timeout: 15000 }
    );
    const body = JSON.stringify(res.data || '');
    const already =
      res.status === 409 ||
      (res.status === 400 && /already exists|already exist/i.test(body));
    if ((res.status >= 200 && res.status < 300) || already) {
      return { field, created: !already };
    }
    const err = new Error(`Qdrant payload index failed: ${res.status} ${body.slice(0, 240)}`);
    err.code = 'QDRANT_INDEX_FAILED';
    err.status = res.status;
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

  async function retrievePoints(ids) {
    const root = assertConfigured();
    const list = (Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean);
    if (!list.length) return [];
    const res = await http.post(
      `${root}/collections/${encodeURIComponent(collection)}/points`,
      { ids: list, with_payload: false, with_vector: false },
      { validateStatus: () => true, timeout: 30000 }
    );
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`Qdrant retrieve failed: ${res.status}`);
      err.code = 'QDRANT_RETRIEVE_FAILED';
      err.status = res.status;
      throw err;
    }
    const points = res.data?.result;
    return Array.isArray(points) ? points : [];
  }

  async function deletePoints(ids) {
    const root = assertConfigured();
    const list = (Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean);
    if (!list.length) return { deleted: 0 };
    const res = await http.post(
      `${root}/collections/${encodeURIComponent(collection)}/points/delete?wait=true`,
      { points: list },
      { validateStatus: () => true, timeout: 60000 }
    );
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`Qdrant delete failed: ${res.status}`);
      err.code = 'QDRANT_DELETE_FAILED';
      err.status = res.status;
      throw err;
    }
    return { deleted: list.length };
  }

  async function scrollSnapshotPoints(snapshotId) {
    const root = assertConfigured();
    const sid = String(snapshotId || '').trim();
    if (!sid) return [];
    const found = [];
    let offset;
    for (let page = 0; page < 40; page += 1) {
      const body = {
        filter: { must: [{ key: 'snapshotId', match: { value: sid } }] },
        limit: 256,
        with_payload: ['sourceId'],
        with_vector: false,
      };
      if (offset != null) body.offset = offset;
      const res = await http.post(
        `${root}/collections/${encodeURIComponent(collection)}/points/scroll`,
        body,
        { validateStatus: () => true, timeout: 30000 }
      );
      if (res.status < 200 || res.status >= 300) {
        const err = new Error(`Qdrant scroll failed: ${res.status}`);
        err.code = 'QDRANT_SCROLL_FAILED';
        err.status = res.status;
        throw err;
      }
      const points = Array.isArray(res.data?.result?.points) ? res.data.result.points : [];
      for (const point of points) {
        found.push({
          id: point.id,
          sourceId: String(point.payload?.sourceId || ''),
        });
      }
      offset = res.data?.result?.next_page_offset;
      if (offset == null || offset === '') break;
    }
    return found;
  }

  async function search({ vector, snapshotId, limit = 8, scope = null, must = null }) {
    const root = assertConfigured();
    const sid = String(snapshotId || scope?.snapshotId || '').trim();
    if (!sid) {
      const err = new Error('snapshotId required for Qdrant search');
      err.code = 'SNAPSHOT_BIND_REQUIRED';
      throw err;
    }
    let mustFilters = Array.isArray(must) ? [...must] : null;
    if (!mustFilters) {
      try {
        const { buildQdrantMustFilters } = require('./scopeFilter');
        mustFilters = buildQdrantMustFilters({
          snapshotId: sid,
          projectId: scope?.projectId,
          tenantId: scope?.tenantId,
        });
      } catch {
        mustFilters = [{ key: 'snapshotId', match: { value: sid } }];
      }
    }
    if (!mustFilters.length) {
      mustFilters = [{ key: 'snapshotId', match: { value: sid } }];
    }
    const res = await http.post(
      `${root}/collections/${encodeURIComponent(collection)}/points/search`,
      {
        vector,
        limit: Number(limit) || 8,
        with_payload: true,
        filter: {
          must: mustFilters,
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
    retrievePoints,
    deletePoints,
    scrollSnapshotPoints,
    search,
  };
}

module.exports = {
  createQdrantClient,
  qdrantBaseUrl,
  collectionName,
  DEFAULT_COLLECTION,
};
