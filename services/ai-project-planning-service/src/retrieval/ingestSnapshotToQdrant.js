/**
 * Knowledge Projection ingest — snapshot corpus → embed → Qdrant (single-SNAP).
 * Same snapshot + corpus hash + embedding version + a complete index skips embed and upsert.
 * Changed documents embed in batches. A cached vector is still upserted into the target snapshot.
 */

const crypto = require('crypto');
const { buildCorpusFromSnapshot } = require('./buildCorpusFromSnapshot');
const {
  computeCorpusContentHash,
  computeDocumentContentHash,
  computeEmbeddingInputHash,
  computeIndexCorpusHash,
  CHUNKING_VERSION,
} = require('./corpusContentHash');
const { validateVectorDocument } = require('../knowledge/catalogSchemas');
const { embedTexts, embedVersion } = require('../runtime/ollamaEmbed');
const {
  EMBED_BATCH_LIMIT,
  isOpenAiCompatibleProvider,
} = require('@enterprise/shared/llm/openaiCompatibleClient');
const { createQdrantClient } = require('./qdrantClient');
const { resolveG7IndexStore } = require('./ragIndexManifest');

const LOCK_TTL_MS = 180_000;
const WAIT_READY_MS = 90_000;
const WAIT_POLL_MS = 250;

function pointId(snapshotId, sourceId, embeddingVersion) {
  const raw = `${snapshotId}:${sourceId}:${embeddingVersion}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/** Qdrant stores a 32-hex id as a UUID and returns it with hyphens. */
function canonicalPointId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '');
}

function isIngestAfterQualityEnabled(env = process.env) {
  const v = String(env.RAG_INGEST_AFTER_QUALITY ?? '1')
    .trim()
    .toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

function elapsedMs(startedNs) {
  return Math.max(0, Math.round(Number(process.hrtime.bigint() - startedNs) / 1e6));
}

function chunkArray(items, size) {
  const out = [];
  const step = Math.max(1, size);
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

function splitEligible(corpus, snapshotId) {
  const eligible = [];
  const skippedByType = Object.create(null);
  let skipped = 0;
  for (const doc of corpus) {
    const validated = validateVectorDocument({
      sourceId: doc.sourceId,
      docType: doc.docType,
      text: doc.text,
      metadata: { ...(doc.metadata || {}), snapshotId },
      embeddingVersion: doc.embeddingVersion,
    });
    if (!validated.ok) {
      skipped += 1;
      const type = String(doc.docType || 'unknown');
      skippedByType[type] = (skippedByType[type] || 0) + 1;
      continue;
    }
    eligible.push(doc);
  }
  return { eligible, skipped, skippedByType };
}

function logIngest(detail) {
  console.info('[g7_ingest] %s', JSON.stringify({ event: 'g7_ingest', ...detail }));
}

function toPoint(snapshotId, doc, vector, embeddingVersion) {
  return {
    id: pointId(snapshotId, doc.sourceId, embeddingVersion),
    vector,
    payload: {
      snapshotId,
      sourceId: doc.sourceId,
      docType: doc.docType,
      text: String(doc.text).slice(0, 2000),
      embeddingVersion,
      contentHash: computeDocumentContentHash(doc),
    },
  };
}

async function verifyPointIds(qdrant, ids) {
  const started = process.hrtime.bigint();
  if (!ids.length) return { ok: true, verifyMs: elapsedMs(started) };
  if (typeof qdrant.retrievePoints !== 'function') {
    return { ok: false, verifyMs: elapsedMs(started) };
  }
  const found = await qdrant.retrievePoints(ids);
  const present = new Set((found || []).map((point) => canonicalPointId(point.id)));
  const ok = ids.every((id) => present.has(canonicalPointId(id)));
  return { ok, verifyMs: elapsedMs(started) };
}

async function waitForReady(store, snapshotId, corpusHash, embeddingVersion) {
  const deadline = Date.now() + WAIT_READY_MS;
  while (Date.now() < deadline) {
    const manifest = await store.getManifest(snapshotId);
    if (
      manifest &&
      manifest.status === 'READY' &&
      manifest.corpusHash === corpusHash &&
      manifest.embeddingVersion === embeddingVersion
    ) {
      return manifest;
    }
    if (manifest && manifest.status === 'FAILED') return null;
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
  return null;
}

function cachedReturn(fields) {
  return {
    snapshotId: fields.snapshotId,
    upserted: 0,
    skipped: fields.skipped,
    embedFailed: 0,
    embeddingVersion: fields.embeddingVersion,
    corpusContentHash: fields.corpusContentHash,
    indexCorpusHash: fields.indexHash,
    skippedIngest: true,
    status: 'CACHED',
    embedded: 0,
  };
}

/**
 * @param {{
 *   snapshot?: object,
 *   snapshotId?: string,
 *   env?: NodeJS.ProcessEnv,
 *   embedTextsFn?: Function,
 *   qdrant?: object,
 *   indexStore?: object,
 *   frOverride?: object[]|null,
 *   corpus?: object[]|null,
 *   priorCorpusHash?: string|null,
 *   afterQuality?: boolean,
 * }} opts
 */
async function ingestSnapshotToQdrant(opts = {}) {
  const wallStarted = process.hrtime.bigint();
  const env = opts.env || process.env;
  const snapshot = opts.snapshot;
  const snapshotId = String(
    opts.snapshotId || snapshot?.snapshotId || snapshot?.id || ''
  ).trim();
  if (!snapshotId) {
    const err = new Error('snapshotId required for ingest');
    err.code = 'SNAPSHOT_BIND_REQUIRED';
    throw err;
  }

  const version = embedVersion(env);
  const corpus = Array.isArray(opts.corpus)
    ? opts.corpus
    : buildCorpusFromSnapshot(
        snapshot && typeof snapshot === 'object'
          ? { ...snapshot, snapshotId }
          : { snapshotId },
        { frOverride: opts.frOverride != null ? opts.frOverride : null }
      );

  const frsForHash = Array.isArray(opts.frOverride)
    ? opts.frOverride
    : corpus
        .filter((d) => d.docType === 'srs_canonical')
        .map((d) => ({
          externalId: d.sourceId,
          description: d.text,
        }));
  const corpusContentHash = computeCorpusContentHash({
    snapshotId,
    embeddingVersion: version,
    frs: frsForHash,
    docs: corpus,
  });

  const prior = opts.priorCorpusHash != null ? String(opts.priorCorpusHash) : '';
  if (prior && prior === corpusContentHash) {
    logIngest({
      snapshotId,
      corpusHash: corpusContentHash,
      status: 'CACHED',
      reason: 'prior_corpus_hash',
      documentsTotal: corpus.length,
      documentsEmbedded: 0,
      embeddingRequests: 0,
      embeddingRetries: 0,
      totalMs: elapsedMs(wallStarted),
    });
    return {
      snapshotId,
      upserted: 0,
      skipped: 0,
      embedFailed: 0,
      embeddingVersion: version,
      corpusContentHash,
      skippedIngest: true,
      status: 'CACHED',
      embedded: 0,
    };
  }

  const { eligible, skipped, skippedByType } = splitEligible(corpus, snapshotId);
  const indexHash = computeIndexCorpusHash({
    embeddingVersion: version,
    chunkingVersion: CHUNKING_VERSION,
    docs: eligible,
  });
  const store = resolveG7IndexStore({ env, indexStore: opts.indexStore });
  const qdrant = opts.qdrant || createQdrantClient({ env });
  const embedBatch = opts.embedTextsFn || embedTexts;
  const expectedIds = eligible.map((doc) => pointId(snapshotId, doc.sourceId, version));
  const dashscope = isOpenAiCompatibleProvider(env);
  const providerBatchSize = dashscope ? EMBED_BATCH_LIMIT : 1;
  const baseLog = {
    snapshotId,
    corpusHash: indexHash,
    embeddingVersion: version,
    embedProvider: dashscope ? 'dashscope' : 'ollama',
    documentsTotal: corpus.length,
    documentsEligible: eligible.length,
    documentsSkipped: skipped,
    skippedDocTypes: skippedByType,
    batchSize: providerBatchSize,
  };

  async function readyHit() {
    const manifest = await store.getManifest(snapshotId);
    if (!manifest || manifest.status !== 'READY') return null;
    if (manifest.corpusHash !== indexHash || manifest.embeddingVersion !== version) return null;
    const check = await verifyPointIds(qdrant, expectedIds);
    if (!check.ok) return null;
    return check;
  }

  const manifestCheckStarted = process.hrtime.bigint();
  const cached = await readyHit();
  const manifestCheckMs = elapsedMs(manifestCheckStarted);
  if (cached) {
    logIngest({
      ...baseLog,
      status: 'CACHED',
      documentsCached: eligible.length,
      documentsEmbedded: 0,
      embeddingRequests: 0,
      embeddingRetries: 0,
      embedMs: 0,
      upsertMs: 0,
      verifyMs: cached.verifyMs,
      manifestCheckMs,
      totalMs: elapsedMs(wallStarted),
    });
    return cachedReturn({
      snapshotId,
      skipped,
      embeddingVersion: version,
      corpusContentHash,
      indexHash,
    });
  }

  const token = crypto.randomBytes(16).toString('hex');
  let locked = await store.acquireLock(snapshotId, token, LOCK_TTL_MS);
  if (!locked) {
    await waitForReady(store, snapshotId, indexHash, version);
    const afterWait = await readyHit();
    if (afterWait) {
      logIngest({
        ...baseLog,
        status: 'CACHED',
        documentsCached: eligible.length,
        documentsEmbedded: 0,
        embeddingRequests: 0,
        embeddingRetries: 0,
        embedMs: 0,
        upsertMs: 0,
        verifyMs: afterWait.verifyMs,
        manifestCheckMs,
        totalMs: elapsedMs(wallStarted),
      });
      return cachedReturn({
        snapshotId,
        skipped,
        embeddingVersion: version,
        corpusContentHash,
        indexHash,
      });
    }
    locked = await store.acquireLock(snapshotId, token, LOCK_TTL_MS);
    if (!locked) {
      const err = new Error(`RAG ingest already in progress snapshotId=${snapshotId}`);
      err.code = 'RAG_INGEST_IN_PROGRESS';
      throw err;
    }
  }

  const heldAfterLock = await readyHit();
  if (heldAfterLock) {
    await store.releaseLock(snapshotId, token);
    logIngest({
      ...baseLog,
      status: 'CACHED',
      documentsCached: eligible.length,
      documentsEmbedded: 0,
      embeddingRequests: 0,
      embeddingRetries: 0,
      embedMs: 0,
      upsertMs: 0,
      verifyMs: heldAfterLock.verifyMs,
      manifestCheckMs,
      totalMs: elapsedMs(wallStarted),
    });
    return cachedReturn({
      snapshotId,
      skipped,
      embeddingVersion: version,
      corpusContentHash,
      indexHash,
    });
  }

  const priorManifest = await store.getManifest(snapshotId);
  const priorMap =
    priorManifest &&
    priorManifest.embeddingVersion === version &&
    priorManifest.documents &&
    typeof priorManifest.documents === 'object'
      ? priorManifest.documents
      : {};

  let embedMs = 0;
  let upsertMs = 0;
  let verifyMs = 0;
  let documentsCached = 0;
  let documentsEmbedded = 0;
  let embeddingRequests = 0;
  let embeddingRetries = 0;

  try {
    await store.putManifest(snapshotId, {
      status: 'BUILDING',
      snapshotId,
      corpusHash: indexHash,
      embeddingVersion: version,
      chunkingVersion: CHUNKING_VERSION,
    });

    const existingIds = new Set();
    if (expectedIds.length && typeof qdrant.retrievePoints === 'function') {
      const found = await qdrant.retrievePoints(expectedIds);
      for (const point of found || []) existingIds.add(canonicalPointId(point.id));
    }

    const points = [];
    const toEmbed = [];
    const documents = Object.create(null);

    for (const doc of eligible) {
      const contentHash = computeDocumentContentHash(doc);
      const id = pointId(snapshotId, doc.sourceId, version);
      documents[doc.sourceId] = contentHash;
      if (priorMap[doc.sourceId] === contentHash && existingIds.has(canonicalPointId(id))) {
        documentsCached += 1;
        continue;
      }
      const inputHash = computeEmbeddingInputHash(doc.text, version);
      const cachedVector = await store.getVector(version, inputHash);
      if (cachedVector) {
        documentsCached += 1;
        points.push(toPoint(snapshotId, doc, cachedVector, version));
        continue;
      }
      toEmbed.push({ doc, inputHash });
    }

    const embedStarted = process.hrtime.bigint();
    for (const batch of chunkArray(toEmbed, providerBatchSize)) {
      const result = await embedBatch({
        texts: batch.map((item) => item.doc.text),
        env,
      });
      embeddingRequests += Number(result?.requestCount) || 0;
      embeddingRetries += Number(result?.retries) || 0;
      const vectors = Array.isArray(result?.embeddings) ? result.embeddings : [];
      if (!result?.ok || vectors.length !== batch.length) {
        const err = new Error(
          `Qdrant ingest embed failed snapshotId=${snapshotId} error=${result?.error || 'embed_failed'}`
        );
        err.code = 'QDRANT_INGEST_FAILED';
        throw err;
      }
      for (let i = 0; i < batch.length; i += 1) {
        const vector = vectors[i];
        if (!Array.isArray(vector) || vector.length !== vectors[0].length) {
          const err = new Error(`Embedding mapping failed for ${batch[i].doc.sourceId}`);
          err.code = 'QDRANT_INGEST_FAILED';
          throw err;
        }
        await store.putVector(version, batch[i].inputHash, vector);
        points.push(toPoint(snapshotId, batch[i].doc, vector, version));
      }
      documentsEmbedded += batch.length;
    }
    embedMs = elapsedMs(embedStarted);

    if (points.length && typeof qdrant.ensureCollection === 'function') {
      await qdrant.ensureCollection(points[0].vector.length);
    }
    const upsertStarted = process.hrtime.bigint();
    if (points.length) await qdrant.upsertPoints(points);
    upsertMs = elapsedMs(upsertStarted);

    const keepSources = new Set(eligible.map((doc) => String(doc.sourceId)));
    const dropIds = [];
    if (typeof qdrant.scrollSnapshotPoints === 'function') {
      const existing = await qdrant.scrollSnapshotPoints(snapshotId);
      for (const point of existing || []) {
        if (point.sourceId && !keepSources.has(String(point.sourceId))) dropIds.push(point.id);
      }
    }
    const priorIds = Array.isArray(priorManifest?.pointIds) ? priorManifest.pointIds : [];
    const keepIds = new Set(expectedIds.map((id) => canonicalPointId(id)));
    for (const id of priorIds) {
      if (!keepIds.has(canonicalPointId(id))) dropIds.push(id);
    }
    if (dropIds.length && typeof qdrant.deletePoints === 'function') {
      await qdrant.deletePoints([...new Set(dropIds.map(String))]);
    }

    const verified = await verifyPointIds(qdrant, expectedIds);
    verifyMs = verified.verifyMs;
    if (!verified.ok) {
      const err = new Error(`Qdrant index incomplete snapshotId=${snapshotId}`);
      err.code = 'QDRANT_INDEX_INCOMPLETE';
      throw err;
    }

    const published = await store.putManifest(snapshotId, {
      status: 'READY',
      snapshotId,
      corpusHash: indexHash,
      embeddingVersion: version,
      chunkingVersion: CHUNKING_VERSION,
      documents,
      pointIds: expectedIds,
    });
    if (!published) {
      console.warn('[g7_ingest] manifest_publish_failed snapshotId=%s', snapshotId);
    }

    logIngest({
      ...baseLog,
      status: 'INGESTED',
      documentsCached,
      documentsEmbedded,
      embeddingRequests,
      embeddingRetries,
      upserted: points.length,
      embedMs,
      upsertMs,
      verifyMs,
      manifestCheckMs,
      totalMs: elapsedMs(wallStarted),
    });

    return {
      snapshotId,
      upserted: points.length,
      skipped,
      embedFailed: 0,
      embeddingVersion: version,
      corpusContentHash,
      indexCorpusHash: indexHash,
      skippedIngest: false,
      status: 'INGESTED',
      embedded: documentsEmbedded,
      embeddingRequests,
      embeddingRetries,
    };
  } catch (err) {
    try {
      await store.putManifest(snapshotId, {
        status: 'FAILED',
        snapshotId,
        corpusHash: indexHash,
        embeddingVersion: version,
        chunkingVersion: CHUNKING_VERSION,
        error: String(err?.message || err).slice(0, 300),
      });
    } catch {
      /* lock release still runs */
    }
    throw err;
  } finally {
    await store.releaseLock(snapshotId, token);
  }
}

module.exports = {
  ingestSnapshotToQdrant,
  pointId,
  canonicalPointId,
  isIngestAfterQualityEnabled,
};
