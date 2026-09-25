/**
 * Knowledge Projection ingest — snapshot corpus → embed → Qdrant (single-SNAP).
 */

const { createHash } = require('node:crypto');
const { buildCorpusFromSnapshot } = require('./buildCorpusFromSnapshot');
const { validateVectorDocument } = require('../knowledge/g1CatalogSchemas');
const { embedText, embedVersion } = require('../runtime/ollamaEmbed');
const { createQdrantClient } = require('./qdrantClient');

function pointId(snapshotId, sourceId, embeddingVersion) {
  const raw = `${snapshotId}:${sourceId}:${embeddingVersion}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * @param {{
 *   snapshot?: object,
 *   snapshotId?: string,
 *   env?: NodeJS.ProcessEnv,
 *   embedFn?: typeof embedText,
 *   qdrant?: ReturnType<typeof createQdrantClient>,
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

  const corpus = buildCorpusFromSnapshot(
    snapshot && typeof snapshot === 'object'
      ? { ...snapshot, snapshotId }
      : { snapshotId }
  );
  const embedFn = opts.embedFn || embedText;
  const qdrant = opts.qdrant || createQdrantClient({ env });
  const version = embedVersion(env);

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
    '[g7_ingest]',
    snapshotId,
    'points=',
    points.length,
    'skipped=',
    skipped,
    'embedFailed=',
    embedFailed
  );

  return {
    snapshotId,
    upserted: points.length,
    skipped,
    embedFailed,
    embeddingVersion: version,
  };
}

module.exports = {
  ingestSnapshotToQdrant,
  pointId,
};
