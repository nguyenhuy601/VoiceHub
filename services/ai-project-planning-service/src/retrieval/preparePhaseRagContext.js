/**
 * Shared phase RAG prepare (WHAT + HOW) — ingest once, assemble CP nền.
 * Per-task retrieve happens via assembleTaskContext (required + supplement).
 */

const { buildCorpusFromSnapshot } = require('./buildCorpusFromSnapshot');
const { assembleContextPackageAsync } = require('./contextAssembly');
const { getRagMode, requiresQdrant } = require('./ragPipelineSchemas');
const { resolveScopeFromSnapshot, buildRetrieveCacheKey } = require('./scopeFilter');
const { filterDocsForGenerate } = require('./provenanceFilters');
const { deriveCpQuality, assessEvidenceStatus } = require('./ragStatus');
const {
  bindRequiredInputs,
  assembleRequiredWithCitations,
} = require('./bindRequiredInputs');
const { buildWhatRetrieveQuery } = require('./formatRetrievedContext');
const { preGenerateContextCheck } = require('./preGenerateContextCheck');

async function maybeIngest({ snapshot, snapshotId, corpus, mode, forceIngest }) {
  if (forceIngest === false) return { skippedIngest: true };
  if (!(mode === 'qdrant' || mode === 'hybrid') || !snapshotId) {
    return { skippedIngest: true };
  }
  const { ingestSnapshotToQdrant } = require('./ingestSnapshotToQdrant');
  return ingestSnapshotToQdrant({
    snapshot,
    snapshotId,
    corpus,
  });
}

/**
 * Prepare corpus + optional ingest + base contextPackage for a phase.
 * @param {{
 *   phase: 'what'|'how',
 *   snapshot: object,
 *   snapshotId?: string,
 *   pack?: object,
 *   query?: string,
 *   env?: object,
 *   skipIngest?: boolean,
 * }} input
 */
async function preparePhaseRagContext(input = {}) {
  const phase = input.phase === 'how' ? 'how' : 'what';
  const snapshot = input.snapshot;
  const pack = input.pack || null;
  const scope = resolveScopeFromSnapshot(snapshot, {
    snapshotId: input.snapshotId,
    projectId: input.projectId,
    tenantId: input.tenantId,
  });
  const snapshotId = scope.snapshotId || String(input.snapshotId || '').trim();
  const env = input.env || process.env;
  const mode = input.mode || getRagMode(env);

  const corpus = buildCorpusFromSnapshot(snapshot, {
    phase,
    pack,
    frOverride: input.frOverride,
    scope,
  });

  let retrievalStatus = 'ok';
  let ingestWarning = null;
  let ingestResult = null;

  try {
    ingestResult = await maybeIngest({
      snapshot,
      snapshotId,
      corpus,
      mode,
      forceIngest: input.skipIngest ? false : true,
    });
  } catch (ingestErr) {
    ingestWarning = String(ingestErr?.message || ingestErr);
    if (requiresQdrant(mode) && mode === 'qdrant') {
      retrievalStatus = 'failed';
    } else {
      retrievalStatus = 'degraded';
    }
    console.warn('[preparePhaseRagContext] ingest', ingestWarning);
  }

  const query =
    String(input.query || '').trim() ||
    (phase === 'what'
      ? buildWhatRetrieveQuery({
          snapshot,
          pack,
          taskPurpose: input.taskPurpose || 'requirements',
        })
      : 'how planning');

  let contextPackage;
  try {
    contextPackage = await assembleContextPackageAsync({
      query,
      corpus: filterDocsForGenerate(corpus),
      snapshotId,
      snapshot,
      mode: retrievalStatus === 'failed' ? 'keyword' : mode,
      env,
      scope,
    });
  } catch (retrieveErr) {
    retrievalStatus = retrievalStatus === 'failed' ? 'failed' : 'degraded';
    ingestWarning = String(retrieveErr?.message || retrieveErr);
    try {
      contextPackage = await assembleContextPackageAsync({
        query,
        corpus: filterDocsForGenerate(corpus),
        snapshotId,
        snapshot,
        mode: 'keyword',
        env,
        scope,
      });
    } catch (kwErr) {
      retrievalStatus = 'failed';
      contextPackage = {
        query,
        citations: [],
        assembledAt: new Date().toISOString(),
        mode: 'keyword',
        stub: true,
      };
      ingestWarning = String(kwErr?.message || kwErr);
    }
  }

  const evidenceStatus = assessEvidenceStatus({
    requiredInputs: [],
    citations: contextPackage?.citations,
    requireEvidence: false,
  });
  const cpQuality = deriveCpQuality(retrievalStatus, evidenceStatus);

  contextPackage = {
    ...contextPackage,
    retrievalStatus,
    evidenceStatus,
    cpQuality,
    scope,
    cacheKey: buildRetrieveCacheKey({
      ...scope,
      query,
      mode: contextPackage?.mode || mode,
      taskPurpose: input.taskPurpose || phase,
    }),
    ...(ingestWarning ? { ingestWarning } : {}),
    ...(ingestResult?.skippedIngest != null
      ? { skippedIngest: ingestResult.skippedIngest }
      : {}),
  };

  return {
    corpus,
    contextPackage,
    scope,
    snapshotId,
    phase,
    retrievalStatus,
  };
}

/**
 * Per-generate: bind required → retrieve supplement → assemble → pre-check.
 */
async function assembleTaskContext(input = {}) {
  const scope =
    input.scope ||
    resolveScopeFromSnapshot(input.snapshot, {
      snapshotId: input.snapshotId,
      projectId: input.projectId,
      tenantId: input.tenantId,
    });
  const bind = bindRequiredInputs({
    sourceIds: input.sourceIds,
    rows: input.rows,
    pack: input.pack,
    snapshot: input.snapshot,
    scope,
    taskPurpose: input.taskPurpose,
    maxChars: input.maxRequiredChars,
  });

  if (bind.status === 'input_too_large') {
    return {
      contextPackage: {
        query: '',
        citations: [],
        assembledAt: new Date().toISOString(),
        requiredInputs: bind.requiredInputs,
        inputTooLarge: true,
        splitSuggested: bind.splitSuggested,
        retrievalStatus: input.retrievalStatus || 'ok',
        evidenceStatus: 'insufficient',
        cpQuality: 'insufficient',
        scope,
      },
      bind,
      preCheck: {
        ok: false,
        canGenerate: false,
        errors: ['input_too_large'],
        evidenceStatus: 'insufficient',
      },
    };
  }

  const query =
    String(input.query || '').trim() ||
    buildWhatRetrieveQuery({
      snapshot: input.snapshot,
      pack: input.pack,
      taskPurpose: input.taskPurpose || 'cr_to_fr',
      requiredInputs: bind.requiredInputs,
      customerRawChunk: bind.requiredInputs[0],
    });

  const corpus = Array.isArray(input.corpus)
    ? input.corpus
    : buildCorpusFromSnapshot(input.snapshot, {
        phase: input.phase || 'what',
        pack: input.pack,
        scope,
      });

  let retrievalStatus = input.retrievalStatus || 'ok';
  let pkg;
  try {
    pkg = await assembleContextPackageAsync({
      query,
      corpus: filterDocsForGenerate(corpus),
      snapshotId: scope.snapshotId,
      snapshot: input.snapshot,
      mode: input.mode,
      env: input.env,
      scope,
      topK: input.topK,
    });
  } catch (err) {
    retrievalStatus = 'degraded';
    pkg = await assembleContextPackageAsync({
      query,
      corpus: filterDocsForGenerate(corpus),
      snapshotId: scope.snapshotId,
      mode: 'keyword',
      env: input.env,
      scope,
    });
  }

  const merged = assembleRequiredWithCitations({
    requiredInputs: bind.requiredInputs,
    citations: pkg.citations,
    maxSupplementItems: input.maxSupplementItems,
    maxSupplementChars: input.maxSupplementChars,
  });

  const evidenceStatus = assessEvidenceStatus({
    requiredInputs: bind.requiredInputs,
    citations: merged.citations,
    requireEvidence: Boolean(input.requireEvidence) || bind.requiredInputs.length > 0,
  });
  const cpQuality = deriveCpQuality(retrievalStatus, evidenceStatus);

  let contextPackage = {
    ...pkg,
    query,
    citations: merged.citations,
    requiredInputs: merged.requiredInputs,
    retrievalStatus,
    evidenceStatus,
    cpQuality,
    scope,
    taskPurpose: input.taskPurpose || null,
  };

  let preCheck = preGenerateContextCheck({
    contextPackage,
    requiredInputs: merged.requiredInputs,
    scope,
    retrievalStatus,
    requireEvidence: Boolean(input.requireEvidence),
  });

  contextPackage = {
    ...contextPackage,
    evidenceStatus: preCheck.evidenceStatus,
    cpQuality: preCheck.cpQuality,
  };

  // Wave 2: limited agentic retrieve when evidence insufficient
  if (
    input.enableAgentic &&
    preCheck.evidenceStatus === 'insufficient' &&
    !contextPackage.inputTooLarge &&
    typeof input.decideRetrieveMoreFn === 'function'
  ) {
    const agentic = await runLimitedAgenticRetrieveLoop({
      ...input,
      contextPackage,
      corpus,
      scope,
      query,
      retrievalStatus,
      requiredInputs: merged.requiredInputs,
    });
    if (agentic?.contextPackage) {
      contextPackage = agentic.contextPackage;
      preCheck = preGenerateContextCheck({
        contextPackage,
        requiredInputs: merged.requiredInputs,
        scope,
        retrievalStatus: contextPackage.retrievalStatus || retrievalStatus,
        requireEvidence: Boolean(input.requireEvidence),
      });
    }
  }

  return { contextPackage, bind, preCheck, query };
}

/**
 * Wave 2 — limited Agentic Retrieval loop using shared pipeline + stop policy.
 */
async function runLimitedAgenticRetrieveLoop(input = {}) {
  const { parseAgenticRetrieveDecision } = require('./agenticRetrieveDecision');
  const { evaluateAgenticProgress } = require('./agenticProgress');
  const { assembleContextPackageAsync } = require('./contextAssembly');
  const { filterDocsForGenerate } = require('./provenanceFilters');
  const { assembleRequiredWithCitations } = require('./bindRequiredInputs');
  const { assessEvidenceStatus, deriveCpQuality } = require('./ragStatus');

  let contextPackage = input.contextPackage;
  const scope = input.scope || {};
  const corpus = Array.isArray(input.corpus) ? input.corpus : [];
  const requiredInputs = Array.isArray(input.requiredInputs) ? input.requiredInputs : [];
  let seenSourceIds = new Set(
    (contextPackage?.citations || []).map((c) => String(c.sourceId || '')).filter(Boolean)
  );
  let seenSpanIds = new Set(
    (contextPackage?.citations || [])
      .map((c) => String(c.metadata?.spanId || c.sourceId || ''))
      .filter(Boolean)
  );
  let openGaps = [];
  let noProgressRounds = 0;
  let retrievalStatus = input.retrievalStatus || contextPackage?.retrievalStatus || 'ok';
  const maxRounds = Number(input.maxAgenticRounds) > 0 ? Number(input.maxAgenticRounds) : 3;

  for (let round = 1; round <= maxRounds; round += 1) {
    let decisionRaw;
    try {
      decisionRaw = await input.decideRetrieveMoreFn({
        contextPackage,
        missingInformation: openGaps,
        round,
        scope: {
          snapshotId: scope.snapshotId,
          projectId: scope.projectId,
          tenantId: scope.tenantId,
        },
      });
    } catch (err) {
      contextPackage = {
        ...contextPackage,
        agenticStopReason: `decide_failed:${err?.message || err}`,
        agenticStatus: 'incomplete',
      };
      break;
    }

    const parsed = parseAgenticRetrieveDecision(decisionRaw);
    if (!parsed.ok || !parsed.decision) {
      contextPackage = {
        ...contextPackage,
        agenticStopReason: `invalid_decision:${(parsed.errors || []).join(',')}`,
        agenticStatus: 'incomplete',
      };
      break;
    }

    const { decision, missingInformation, queries } = parsed.decision;
    openGaps = missingInformation.length ? missingInformation : openGaps;

    if (decision === 'generate') {
      contextPackage = {
        ...contextPackage,
        evidenceStatus: 'sufficient',
        agenticStopReason: 'llm_generate',
        agenticStatus: 'ready',
      };
      break;
    }
    if (decision === 'clarify') {
      contextPackage = {
        ...contextPackage,
        evidenceStatus: 'conflicting',
        agenticStopReason: 'clarify',
        agenticStatus: 'clarify',
      };
      break;
    }
    if (decision === 'stop_incomplete') {
      contextPackage = {
        ...contextPackage,
        agenticStopReason: 'stop_incomplete',
        agenticStatus: 'incomplete',
      };
      break;
    }

    const newCitations = [];
    for (const q of queries) {
      try {
        const pkg = await assembleContextPackageAsync({
          query: q.query,
          corpus: filterDocsForGenerate(
            q.targetDocTypes?.length
              ? corpus.filter((d) => q.targetDocTypes.includes(d.docType))
              : corpus
          ),
          snapshotId: scope.snapshotId,
          snapshot: input.snapshot,
          mode: input.mode,
          env: input.env,
          scope,
          topK: input.topK,
        });
        for (const c of pkg.citations || []) newCitations.push(c);
        if (pkg.retrievalStatus === 'degraded') retrievalStatus = 'degraded';
      } catch (err) {
        retrievalStatus = 'degraded';
      }
    }

    const progress = evaluateAgenticProgress({
      seenSourceIds,
      seenSpanIds,
      openGaps,
      closedGaps: [],
      newCitations,
      rounds: round,
      maxRounds,
      noProgressRounds,
      budgetExhausted: false,
      evidenceStatus: assessEvidenceStatus({
        requiredInputs,
        citations: [...(contextPackage.citations || []), ...newCitations],
        requireEvidence: true,
      }),
    });

    noProgressRounds = progress.noProgressRounds;
    seenSourceIds = new Set(progress.nextSeenSourceIds);
    seenSpanIds = new Set(progress.nextSeenSpanIds);

    const merged = assembleRequiredWithCitations({
      requiredInputs,
      citations: [...(contextPackage.citations || []), ...newCitations],
      maxSupplementItems: input.maxSupplementItems,
      maxSupplementChars: input.maxSupplementChars,
    });
    const evidenceStatus = progress.action === 'generate'
      ? 'sufficient'
      : assessEvidenceStatus({
          requiredInputs,
          citations: merged.citations,
          requireEvidence: true,
        });

    contextPackage = {
      ...contextPackage,
      citations: merged.citations,
      requiredInputs: merged.requiredInputs,
      retrievalStatus,
      evidenceStatus,
      cpQuality: deriveCpQuality(retrievalStatus, evidenceStatus),
      agenticRound: round,
      agenticProgress: {
        newSourceIds: progress.newSourceIds,
        newSpanIds: progress.newSpanIds,
        stopReason: progress.stopReason,
      },
    };

    if (progress.stop) {
      contextPackage = {
        ...contextPackage,
        agenticStopReason: progress.stopReason,
        agenticStatus:
          progress.action === 'generate'
            ? 'ready'
            : progress.action === 'clarify'
              ? 'clarify'
              : 'incomplete',
      };
      break;
    }
  }

  return { contextPackage };
}

module.exports = {
  preparePhaseRagContext,
  assembleTaskContext,
  runLimitedAgenticRetrieveLoop,
};
