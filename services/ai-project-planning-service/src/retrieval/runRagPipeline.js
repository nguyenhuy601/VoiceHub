/**
 * RAG pipeline orchestration — Intent → Retrieve → Rerank/Filter → Assemble.
 * Step 5: qdrant real retrieve; hybrid = keyword ∪ Qdrant (async).
 */

const {
  getRagMode,
  classifyQueryIntent,
  validateContextPackage,
  RAG_PIPELINE_STEPS,
} = require('./ragPipelineSchemas');
const { retrieveStub } = require('./retrieveStub');
const { retrieveKeyword } = require('./retrieveKeyword');
const { retrieveHybrid } = require('./retrieveHybrid');
const { retrieveQdrant } = require('./retrieveQdrant');
const { rerankAndFilter } = require('./rerankFilter');

function assembleCitations({
  query,
  citations = [],
  mode,
  intent,
  stub = true,
} = {}) {
  return {
    query: String(query || ''),
    citations: Array.isArray(citations) ? citations : [],
    assembledAt: new Date().toISOString(),
    mode,
    intent,
    stub: stub !== false,
  };
}

function mergeDocsBySource(a = [], b = []) {
  const bySource = new Map();
  for (const doc of [...a, ...b]) {
    const key = String(doc.sourceId || doc.id || '');
    if (!key) continue;
    const prev = bySource.get(key);
    if (!prev || (Number(doc.score) || 0) > (Number(prev.score) || 0)) {
      bySource.set(key, doc);
    }
  }
  return [...bySource.values()].sort(
    (x, y) =>
      (Number(y.score) || 0) - (Number(x.score) || 0) ||
      String(x.sourceId || '').localeCompare(String(y.sourceId || ''))
  );
}

/**
 * @returns {Promise<{ docs: object[], modeUsed: string, isStub: boolean }>}
 */
async function dispatchRetrieve({
  query,
  corpus,
  mode,
  intent,
  snapshotId,
  env,
  scope,
}) {
  if (mode === 'off') {
    return { docs: [], modeUsed: 'off', isStub: true, retrievalStatus: 'ok' };
  }
  if (mode === 'keyword') {
    const started = process.hrtime.bigint();
    const { docs, modeUsed } = retrieveKeyword({ query, corpus, intent, scope });
    const bm25Ms = Math.max(0, Math.round(Number(process.hrtime.bigint() - started) / 1e6));
    return {
      docs,
      modeUsed,
      isStub: false,
      retrievalStatus: 'ok',
      timing: { bm25Ms, queryEmbedMs: 0, searchMs: 0 },
    };
  }
  if (mode === 'qdrant') {
    try {
      const out = await retrieveQdrant({ query, snapshotId, env, scope });
      return {
        docs: out.docs,
        modeUsed: 'qdrant',
        isStub: false,
        retrievalStatus: 'ok',
        timing: { bm25Ms: 0, ...(out.timing || {}) },
      };
    } catch (err) {
      const { docs } = retrieveKeyword({ query, corpus, intent, scope });
      return {
        docs,
        modeUsed: 'keyword',
        isStub: false,
        retrievalStatus: 'degraded',
        retrieveWarning: String(err?.message || err),
        timing: { bm25Ms: 0, queryEmbedMs: 0, searchMs: 0 },
      };
    }
  }
  if (mode === 'hybrid') {
    const kwStarted = process.hrtime.bigint();
    const { docs: kwDocs } = retrieveKeyword({ query, corpus, intent, scope });
    const bm25Ms = Math.max(0, Math.round(Number(process.hrtime.bigint() - kwStarted) / 1e6));
    try {
      const qd = await retrieveQdrant({ query, snapshotId, env, scope });
      return {
        docs: mergeDocsBySource(kwDocs, qd.docs),
        modeUsed: 'hybrid',
        isStub: false,
        retrievalStatus: 'ok',
        timing: { bm25Ms, ...(qd.timing || {}) },
      };
    } catch (err) {
      return {
        docs: kwDocs,
        modeUsed: 'keyword',
        isStub: false,
        retrievalStatus: 'degraded',
        retrieveWarning: String(err?.message || err),
        timing: { bm25Ms, queryEmbedMs: 0, searchMs: 0 },
      };
    }
  }
  // legacy hybrid (pre-qdrant) path when explicitly requested without snapshot — keep retrieveHybrid
  if (mode === 'hybrid_legacy') {
    const { docs, modeUsed } = retrieveHybrid({ query, corpus, intent });
    return { docs, modeUsed, isStub: false };
  }
  const { docs, modeUsed } = retrieveStub({ query, corpus, mode: 'stub' });
  return { docs, modeUsed: modeUsed || 'stub', isStub: true };
}

/**
 * @param {{
 *   query?: string,
 *   corpus?: object[],
 *   mode?: string,
 *   intent?: string,
 *   topK?: number,
 *   snapshotId?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 */
async function runRagPipeline(input = {}) {
  const query = String(input.query || '').trim();
  const corpus = Array.isArray(input.corpus) ? input.corpus : [];
  const mode = input.mode || getRagMode(input.env || process.env);
  const intent = input.intent || classifyQueryIntent(query);
  const snapshotId = String(
    input.snapshotId || input.snapshot?.snapshotId || input.snapshot?.id || ''
  ).trim();

  // Track A: Qdrant/hybrid always bind snapshotId; optional full payload assert
  if (mode === 'qdrant' || mode === 'hybrid') {
    if (!snapshotId) {
      const err = new Error(
        `snapshotId required for RAG_MODE=${mode}`
      );
      err.code = 'SNAPSHOT_BIND_REQUIRED';
      throw err;
    }
    if (input.snapshot && typeof input.snapshot === 'object') {
      const { assertSnapshotBoundary } = require('../knowledge/assertSnapshotBoundary');
      assertSnapshotBoundary({
        snapshotId,
        snapshot: input.snapshot,
        phase: 'g7',
      });
    }
  }

  const scope = input.scope || (snapshotId ? { snapshotId } : null);
  const {
    docs,
    modeUsed,
    isStub,
    timing = {},
    retrievalStatus = 'ok',
    retrieveWarning = null,
  } = await dispatchRetrieve({
    query,
    corpus,
    mode,
    intent,
    snapshotId,
    env: input.env,
    scope,
  });

  const rerankStarted = process.hrtime.bigint();
  const citations =
    mode === 'off' ? [] : rerankAndFilter({ docs, corpus, topK: input.topK });
  const rerankMs = Math.max(
    0,
    Math.round(Number(process.hrtime.bigint() - rerankStarted) / 1e6)
  );

  const assembleStarted = process.hrtime.bigint();
  const pkg = assembleCitations({
    query,
    citations,
    mode: modeUsed || mode,
    intent,
    stub: isStub,
  });
  const contextBuildMs = Math.max(
    0,
    Math.round(Number(process.hrtime.bigint() - assembleStarted) / 1e6)
  );

  if (mode === 'qdrant' || mode === 'hybrid') {
    console.info(
      '[g7_retrieve_timing] %s',
      JSON.stringify({
        event: 'g7_retrieve',
        snapshotId,
        mode: modeUsed || mode,
        retrievalStatus,
        bm25Ms: timing.bm25Ms ?? 0,
        queryEmbedMs: timing.queryEmbedMs ?? 0,
        searchMs: timing.searchMs ?? 0,
        rerankMs,
        contextBuildMs,
        hits: docs.length,
        citations: citations.length,
      })
    );
  }

  const validated = validateContextPackage(pkg);
  if (!validated.ok) {
    return {
      query,
      citations: [],
      assembledAt: new Date().toISOString(),
      mode: mode === 'off' ? 'off' : mode,
      intent,
      stub: true,
      retrievalStatus: retrievalStatus === 'ok' ? 'failed' : retrievalStatus,
      steps: [...RAG_PIPELINE_STEPS],
      _validationErrors: validated.errors,
      ...(retrieveWarning ? { retrieveWarning } : {}),
    };
  }

  return {
    ...validated.package,
    stub: pkg.stub === false ? false : Boolean(pkg.stub),
    retrievalStatus,
    steps: [...RAG_PIPELINE_STEPS],
    ...(retrieveWarning ? { retrieveWarning } : {}),
  };
}

/** Sync wrapper for stub/keyword unit tests — rejects qdrant/hybrid. */
function runRagPipelineSync(input = {}) {
  const mode = input.mode || getRagMode(input.env || process.env);
  if (mode === 'qdrant' || mode === 'hybrid') {
    throw new Error('runRagPipelineSync does not support qdrant/hybrid — use await runRagPipeline');
  }
  // Re-use sync dispatch for stub/keyword/off only
  const query = String(input.query || '').trim();
  const corpus = Array.isArray(input.corpus) ? input.corpus : [];
  const intent = input.intent || classifyQueryIntent(query);
  let docs = [];
  let modeUsed = mode;
  let isStub = true;
  if (mode === 'off') {
    docs = [];
    isStub = true;
  } else if (mode === 'keyword') {
    ({ docs, modeUsed } = retrieveKeyword({
      query,
      corpus,
      intent,
      scope: input.scope || null,
    }));
    isStub = false;
  } else {
    const stubOut = retrieveStub({ query, corpus, mode: 'stub' });
    docs = stubOut.docs;
    modeUsed = stubOut.modeUsed || 'stub';
    isStub = true;
  }
  const citations =
    mode === 'off' ? [] : rerankAndFilter({ docs, corpus, topK: input.topK });
  const pkg = assembleCitations({
    query,
    citations,
    mode: modeUsed || mode,
    intent,
    stub: isStub,
  });
  const validated = validateContextPackage(pkg);
  if (!validated.ok) {
    return {
      query,
      citations: [],
      assembledAt: new Date().toISOString(),
      mode,
      intent,
      stub: true,
      steps: [...RAG_PIPELINE_STEPS],
      _validationErrors: validated.errors,
    };
  }
  return {
    ...validated.package,
    stub: pkg.stub === false ? false : true,
    steps: [...RAG_PIPELINE_STEPS],
  };
}

module.exports = {
  runRagPipeline,
  runRagPipelineSync,
  assembleCitations,
  dispatchRetrieve,
  RAG_PIPELINE_STEPS,
};
