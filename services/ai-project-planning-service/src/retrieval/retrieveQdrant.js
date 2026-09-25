/**
 * G7 retrieve via Qdrant — always filter by run snapshotId (RULE-09 / single-SNAP).
 */

const { embedText } = require('../runtime/ollamaEmbed');
const { createQdrantClient } = require('./qdrantClient');

const SNIPPET_MAX = 200;

/**
 * @param {{
 *   query?: string,
 *   snapshotId?: string,
 *   topK?: number,
 *   env?: NodeJS.ProcessEnv,
 *   embedFn?: typeof embedText,
 *   qdrant?: object,
 * }} args
 */
async function retrieveQdrant(args = {}) {
  const env = args.env || process.env;
  const query = String(args.query || '').trim();
  const snapshotId = String(args.snapshotId || '').trim();
  const topK = Number(args.topK) > 0 ? Number(args.topK) : 8;

  if (!snapshotId) {
    const err = new Error('snapshotId required for retrieveQdrant');
    err.code = 'SNAPSHOT_BIND_REQUIRED';
    throw err;
  }

  const embedFn = args.embedFn || embedText;
  const emb = await embedFn({ text: query || 'planning', env });
  if (!emb.ok) {
    const err = new Error(emb.error || 'embed_failed');
    err.code = 'G7_EMBED_FAILED';
    throw err;
  }

  const qdrant = args.qdrant || createQdrantClient({ env });
  const hits = await qdrant.search({
    vector: emb.embedding,
    snapshotId,
    limit: topK,
  });

  const docs = hits.map((hit, i) => {
    const payload = hit.payload || {};
    const text = String(payload.text || '');
    return {
      sourceId: String(payload.sourceId || hit.id || `qdrant-${i}`),
      id: String(payload.sourceId || hit.id || `qdrant-${i}`),
      text,
      snippet: text.slice(0, SNIPPET_MAX),
      score: Number(hit.score) || 0,
      docType: payload.docType || 'unknown',
      metadata: {
        snapshotId: payload.snapshotId || snapshotId,
        embeddingVersion: payload.embeddingVersion,
      },
    };
  });

  console.log('[g7_retrieve]', snapshotId, 'hits=', docs.length);
  return { docs, modeUsed: 'qdrant', isStub: false };
}

module.exports = { retrieveQdrant };
