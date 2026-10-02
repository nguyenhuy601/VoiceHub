/**
 * Knowledge Projection ingest — snapshot corpus → embed → Qdrant (single-SNAP).
 * RULE-DL-03: skip embed/upsert when corpusContentHash matches prior.
 */

const { createHash } = require('node:crypto');
const { buildCorpusFromSnapshot } = require('./buildCorpusFromSnapshot');
const { computeCorpusContentHash } = require('./corpusContentHash');
const { validateVectorDocument } = require('../knowledge/g1CatalogSchemas');
const { embedText, embedVersion } = require('../runtime/ollamaEmbed');
const { createQdrantClient } = require('./qdrantClient');

function pointId(snapshotId, sourceId, embeddingVersion) {
  const raw = `${snapshotId}:${sourceId}:${embeddingVersion}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function isIngestAfterQualityEnabled(env = process.env) {
  const v = String(env.G7_INGEST_AFTER_QUALITY ?? '1')
    .trim()
    .toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

/**
 * @param {{
 *   snapshot?: object,
 *   snapshotId?: string,
 *   env?: NodeJS.ProcessEnv,
 *   embedFn?: typeof embedText,
 *   qdrant?: ReturnType<typeof createQdrantClient>,
 *   frOverride?: object[]|null,
 *   corpus?: object[]|null,
 *   priorCorpusHash?: string|null,
 *   afterQuality?: boolean,
 * }} opts
 */
async function ingestSnapshotToQdrant(opts = {}) {
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
  });

  const prior = opts.priorCorpusHash != null ? String(opts.priorCorpusHash) : '';
  if (prior && prior === corpusContentHash) {
    console.log(
      '[g7_ingest] after=quality corpusHash=%s skipped snapshotId=%s',
      corpusContentHash,
      snapshotId
    );
    return {
      snapshotId,
      upserted: 0,
      skipped: 0,
      embedFailed: 0,
      embeddingVersion: version,
      corpusContentHash,
      skippedIngest: true,
    };
  }

  const embedFn = opts.embedFn || embedText;
  const qdrant = opts.qdrant || createQdrantClient({ env });

  const points = [];
  let skipped = 0;
  let embedFailed = 0;

  for (const doc of corpus) {
    const vectorDoc = {
      sourceId: doc.sourceId,
      docType: doc.docType,
      text: doc.text,
      metadata: {
        ...(doc.metadata || {}),
        snapshotId,
      },
      embeddingVersion: version,
    };
    const validated = validateVectorDocument(vectorDoc);
    if (!validated.ok) {
      skipped += 1;
      continue;
    }

    const emb = await embedFn({ text: doc.text, env });
    if (!emb.ok || !emb.embedding?.length) {
      embedFailed += 1;
      continue;
    }

    if (points.length === 0) {
      await qdrant.ensureCollection(emb.embedding.length);
    }

    points.push({
      id: pointId(snapshotId, doc.sourceId, version),
      vector: emb.embedding,
      payload: {
        snapshotId,
        sourceId: doc.sourceId,
        docType: doc.docType,
        text: String(doc.text).slice(0, 2000),
        embeddingVersion: version,
      },
    });
  }

  if (points.length) {
    await qdrant.upsertPoints(points);
  }

  console.log(
    '[g7_ingest] after=%s corpusHash=%s snapshotId=%s points=%s skipped=%s embedFailed=%s',
    opts.afterQuality ? 'quality' : 'legacy',
    corpusContentHash,
    snapshotId,
    points.length,
    skipped,
    embedFailed
  );

  return {
    snapshotId,
    upserted: points.length,
    skipped,
    embedFailed,
    embeddingVersion: version,
    corpusContentHash,
    skippedIngest: false,
  };
}

module.exports = {
  ingestSnapshotToQdrant,
  pointId,
  isIngestAfterQualityEnabled,
};
