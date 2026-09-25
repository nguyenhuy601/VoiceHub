/**
 * G7 pipeline orchestration — Intent → Retrieve → Rerank/Filter → Assemble.
 * Step 5: qdrant real retrieve; hybrid = keyword ∪ Qdrant (async).
 */

const {
  getG7RagMode,
  classifyQueryIntent,
  validateContextPackage,
  G7_PIPELINE_STEPS,
} = require('./g7PipelineSchemas');
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
}) {
  if (mode === 'off') {
    return { docs: [], modeUsed: 'off', isStub: true };
  }
  if (mode === 'keyword') {
    const { docs, modeUsed } = retrieveKeyword({ query, corpus, intent });
    return { docs, modeUsed, isStub: false };
  }
  if (mode === 'qdrant') {
    const out = await retrieveQdrant({ query, snapshotId, env });
    return { docs: out.docs, modeUsed: 'qdrant', isStub: false };
  }
  if (mode === 'hybrid') {
    const { docs: kwDocs } = retrieveKeyword({ query, corpus, intent });
    try {
      const qd = await retrieveQdrant({ query, snapshotId, env });
      return {
        docs: mergeDocsBySource(kwDocs, qd.docs),
        modeUsed: 'hybrid',
        isStub: false,
      };
    } catch (error) {
      // Hybrid soft-degrades to keyword when Qdrant unavailable
      console.warn('[g7_hybrid] qdrant failed, keyword only', error?.message || error);
      return { docs: kwDocs, modeUsed: 'hybrid', isStub: false };
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
async function runG7Pipeline(input = {}) {
  const query = String(input.query || '').trim();
  const corpus = Array.isArray(input.corpus) ? input.corpus : [];
  const mode = input.mode || getG7RagMode(input.env || process.env);
  const intent = input.intent || classifyQueryIntent(query);
  const snapshotId = String(
    input.snapshotId || input.snapshot?.snapshotId || input.snapshot?.id || ''
  ).trim();

  // Track A: Qdrant/hybrid always bind snapshotId; optional full payload assert
  if (mode === 'qdrant' || mode === 'hybrid') {
    if (!snapshotId) {
      const err = new Error(
        `snapshotId required for G7_RAG_MODE=${mode}`
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

  const { docs, modeUsed, isStub } = await dispatchRetrieve({
    query,
    corpus,
    mode,
    intent,
    snapshotId,
    env: input.env,
  });

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
      mode: mode === 'off' ? 'off' : mode,
      intent,
      stub: true,
      steps: [...G7_PIPELINE_STEPS],
      _validationErrors: validated.errors,
    };
  }

  return {
    ...validated.package,
    stub: pkg.stub === false ? false : Boolean(pkg.stub),
    steps: [...G7_PIPELINE_STEPS],
  };
}

/** Sync wrapper for stub/keyword unit tests — rejects qdrant/hybrid. */
function runG7PipelineSync(input = {}) {
  const mode = input.mode || getG7RagMode(input.env || process.env);
  if (mode === 'qdrant' || mode === 'hybrid') {
    throw new Error('runG7PipelineSync does not support qdrant/hybrid — use await runG7Pipeline');
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
    ({ docs, modeUsed } = retrieveKeyword({ query, corpus, intent }));
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
      steps: [...G7_PIPELINE_STEPS],
      _validationErrors: validated.errors,
    };
  }
  return {
    ...validated.package,
    stub: pkg.stub === false ? false : true,
    steps: [...G7_PIPELINE_STEPS],
  };
}

module.exports = {
  runG7Pipeline,
  runG7PipelineSync,
  assembleCitations,
  dispatchRetrieve,
  G7_PIPELINE_STEPS,
};
