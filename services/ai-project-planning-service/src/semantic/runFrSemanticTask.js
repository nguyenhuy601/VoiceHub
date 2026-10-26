/**
 * FR SemanticTask — CR propose + finalize around FR understanding graph.
 * Production SoT for the pipeline is whatPhaseGraph `frUnderstanding` (Pattern B).
 * Standalone graph.invoke only when opts.allowStandaloneFrGraph === true (tests).
 */

const { runSemanticTask } = require('./runSemanticTask');
const { TASK_POLICIES } = require('./semanticTaskRegistry');

/**
 * @param {{
 *   snapshot?: object,
 *   pack?: object,
 *   frOpts?: object,
 *   onProgress?: Function,
 *   runId?: string,
 *   env?: NodeJS.ProcessEnv,
 *   allowStandaloneFrGraph?: boolean,
 *   frPipelineFn?: Function,
 * }} opts
 */
function failClosedProposedFr(reason, meta = null) {
  const proposalFragment = {
    section: 'functionalRequirements',
    items: [],
    relations: [],
    clarificationQuestions: [],
    meta: {
      frFromCrSkipped: true,
      frFromCrReason: reason,
      coverage: { status: 'NO_DATA', reason },
    },
  };
  return {
    status: TASK_POLICIES.RUN,
    items: [],
    llmCalls: Number(meta?.llmCalls) || 0,
    proposalFragment,
    coverage: { status: 'NO_DATA', reason },
    semanticOutput: null,
    frUnderstanding: { requirements: [], meta: { frFromCrReason: reason } },
    meta: { frFromCr: meta, fallbackReason: reason },
  };
}

/**
 * CR→FR propose overlay (shared by phase subgraph + standalone test path).
 * @returns {Promise<{
 *   failClosed?: object,
 *   snapshot: object,
 *   pack: object,
 *   proposedById: Map<string, object>,
 *   frFromCrMeta: object|null,
 *   frOpts: object,
 * }>}
 */
async function prepareFrSnapshotForPipeline(opts = {}) {
  const env = opts.env || process.env;
  const packIn = opts.pack || {};
  const { isCustomerRawIntakePack } = require('./rawSectionDerivePolicy');
  const { isWhatFrFromCrFlagOn } = require('../contracts/frFromCrContract');
  const {
    listCustomerRawIntake,
    proposeFrFromCrWithLlm,
    overlayAnalyzedFr,
    isCustomerRequirementId,
  } = require('../engines/frProposeFromCrLlm');

  const crIntake = listCustomerRawIntake(packIn, opts.snapshot, env);
  const listedIds = []
    .concat(packIn.functionalRequirements || [], opts.snapshot?.functionalRequirements || [])
    .map((row) => String(row?.logicalId || row?.id || row?.externalId || '').trim())
    .filter(Boolean);
  const hasAnalyzedFr = listedIds.some((id) => !isCustomerRequirementId(id));
  const customerRaw =
    crIntake.length > 0 && (isCustomerRawIntakePack(packIn) || !hasAnalyzedFr);

  let snapshot = opts.snapshot;
  let pack = packIn;
  /** @type {Map<string, object>} */
  let proposedById = new Map();
  let frFromCrMeta = null;

  const frOpts = { ...(opts.frOpts || {}) };
  const priorPartial = frOpts.priorPartial || frOpts.understandingPartial || null;
  if (priorPartial) frOpts.priorPartial = priorPartial;
  delete frOpts.understandingPartial;

  if (customerRaw && crIntake.length) {
    if (!isWhatFrFromCrFlagOn(env)) {
      return {
        failClosed: failClosedProposedFr('WHAT_FR_FROM_CR_off'),
        snapshot,
        pack,
        proposedById,
        frFromCrMeta,
        frOpts,
      };
    }
    const proposed = await proposeFrFromCrWithLlm({
      pack: packIn,
      snapshot: opts.snapshot,
      env,
      generateJsonFn: opts.generateJsonFn,
    });
    frFromCrMeta = proposed.meta || null;
    if (!proposed.ok || !Array.isArray(proposed.items) || !proposed.items.length) {
      return {
        failClosed: failClosedProposedFr(
          proposed.meta?.fallbackReason || 'missing_proposed_fr',
          frFromCrMeta
        ),
        snapshot,
        pack,
        proposedById,
        frFromCrMeta,
        frOpts,
      };
    }
    const overlaid = overlayAnalyzedFr(opts.snapshot, packIn, proposed.items);
    snapshot = overlaid.snapshot;
    pack = overlaid.pack;
    proposedById = new Map(proposed.items.map((row) => [String(row.id), row]));
    delete frOpts.priorPartial;
  }

  return { snapshot, pack, proposedById, frFromCrMeta, frOpts };
}

/**
 * Build FR semantic result from pipeline output (proposal + integrity + FrDecompose).
 */
async function finalizeFrSemanticFromPipeline(g4Out, opts = {}, ctx = {}) {
  const proposedById = ctx.proposedById instanceof Map ? ctx.proposedById : new Map();
  const frFromCrMeta = ctx.frFromCrMeta || null;
  const {
    mergeProposedFrRequirements,
    isCustomerRequirementId,
  } = require('../engines/frProposeFromCrLlm');

  if ((g4Out?.paused || g4Out?.blocked) && !proposedById.size) {
    return {
      items: [],
      llmCalls: Number(g4Out?.frUnderstanding?.meta?.llm?.calls) || 0,
      semanticOutput: null,
      proposalFragment: null,
      coverage: { status: 'PARTIAL', reason: g4Out?.paused ? 'data_gate' : 'blocked' },
      meta: { g4Out },
      paused: Boolean(g4Out?.paused),
      blocked: Boolean(g4Out?.blocked),
      g4Out,
    };
  }

  const {
    buildFunctionalRequirementProposal,
  } = require('../requirementAnalysis/functionalRequirements/buildFunctionalRequirementProposal');
  const {
    validateFunctionalRequirements,
  } = require('../requirementAnalysis/functionalRequirements/validateFunctionalRequirements');
  const {
    evaluateRequirementIntegrityGate,
  } = require('../validation/requirementIntegrityGate');

  const g4Body =
    g4Out?.frUnderstanding && typeof g4Out.frUnderstanding === 'object'
      ? g4Out.frUnderstanding
      : { requirements: [], relationships: [], ambiguities: [], assumptions: [], meta: {} };
  const requirementIntegrityGate = evaluateRequirementIntegrityGate({
    frUnderstanding: g4Body,
    validation: g4Out?.validation,
  });
  const conflictAmbiguityGate = requirementIntegrityGate;
  const frUnderstanding = {
    ...g4Body,
    conflictAmbiguityGate,
    requirementIntegrityGate,
    meta: {
      ...(g4Body.meta || {}),
      conflictAmbiguityGate,
      requirementIntegrityGate,
    },
  };

  const { synthesis: _s, ...sem } = frUnderstanding;
  if (proposedById.size) {
    const g4Count = Array.isArray(sem.requirements) ? sem.requirements.length : 0;
    sem.requirements = mergeProposedFrRequirements(
      [...proposedById.values()],
      sem.requirements
    );
    console.info(
      `[fr-from-cr] proposalItems=${sem.requirements.length} g4Req=${g4Count}`
    );
  } else if (Array.isArray(sem.requirements)) {
    sem.requirements = sem.requirements.filter(
      (row) => !isCustomerRequirementId(row?.id || row?.frId)
    );
  }
  const validated = validateFunctionalRequirements({ frUnderstanding: sem });
  const proposalFragment = buildFunctionalRequirementProposal({
    validated,
    generationId: opts.runId || null,
  });

  let frDecomposeMeta = null;
  try {
    const { proposeFrDecomposeWithLlm } = require('../engines/frDecomposeLlm');
    const semanticBrief = {
      business: {
        locale: opts.pack?.aiAnalysis?.deriveLocale || opts.pack?.locale || null,
      },
      ambiguities: Array.isArray(sem.ambiguities) ? sem.ambiguities.slice(0, 12) : [],
    };
    const dec = await proposeFrDecomposeWithLlm({
      pack: opts.pack || {},
      proposalItems: proposalFragment?.items || [],
      semantic: semanticBrief,
      env: opts.env || process.env,
      generateJsonFn: opts.generateJsonFn,
    });
    frDecomposeMeta = dec.meta || null;
    if (dec.ok && dec.backlogStructure) {
      proposalFragment.backlogStructure = dec.backlogStructure;
      const cqFromDecompose = (dec.backlogStructure.openQuestions || []).map((q, i) => ({
        logicalId: q.code || `CQ-DECOMPOSE-${i + 1}`,
        requirementId: Array.isArray(q.frIds) ? q.frIds[0] || null : null,
        kind: 'decompose',
        message: q.message || '',
        status: 'NEEDS_CONFIRMATION',
      }));
      if (cqFromDecompose.length) {
        proposalFragment.clarificationQuestions = [
          ...(proposalFragment.clarificationQuestions || []),
          ...cqFromDecompose,
        ];
      }
    } else if (dec.meta?.reasonCodes) {
      proposalFragment.meta = {
        ...(proposalFragment.meta || {}),
        frDecomposeSkipped: true,
        frDecomposeReason: dec.meta.fallbackReason || dec.meta.reasonCodes.join(','),
      };
    }
  } catch (err) {
    console.warn(
      '[runFrSemanticTask] frDecompose fail-soft',
      String(err?.message || err)
    );
    proposalFragment.meta = {
      ...(proposalFragment.meta || {}),
      frDecomposeSkipped: true,
      frDecomposeReason: String(err?.message || err || 'fr_decompose_throw'),
    };
  }

  const decompCalls = Number(frDecomposeMeta?.llmCalls) || 0;
  const g4Calls =
    Number(frUnderstanding?.meta?.llm?.calls) || (frUnderstanding?.meta?.llm ? 1 : 0);

  return {
    items: proposalFragment?.items || [],
    llmCalls: g4Calls + decompCalls,
    semanticOutput: frUnderstanding,
    proposalFragment,
    coverage: { status: 'AVAILABLE' },
    meta: {
      conflictAmbiguityGate,
      requirementIntegrityGate,
      g4Out,
      frDecompose: frDecomposeMeta,
      frFromCr: frFromCrMeta,
    },
    frUnderstanding,
    conflictAmbiguityGate,
    requirementIntegrityGate,
    g4Out,
  };
}

async function runFrGraphViaAllowedPath(opts = {}) {
  if (typeof opts.frPipelineFn === 'function') {
    return opts.frPipelineFn(opts);
  }
  if (opts.allowStandaloneFrGraph === true) {
    const { invokeFrUnderstandingStandalone } = require('../engines/frUnderstanding');
    return invokeFrUnderstandingStandalone({
      ...opts,
      allowStandaloneFrGraph: true,
    });
  }
  const err = new Error(
    'FR understanding runs only as runFrUnderstanding node on whatPhaseGraph (Pattern B). Not via runFrSemanticTask/invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

async function runFrSemanticTask(opts = {}) {
  const env = opts.env || process.env;
  const prepared = await prepareFrSnapshotForPipeline(opts);
  if (prepared.failClosed) return prepared.failClosed;

  const { snapshot, pack, proposedById, frFromCrMeta, frOpts } = prepared;

  return runSemanticTask({
    taskId: 'fr',
    rows: [{ id: 'fr-runtime-sentinel' }],
    pack,
    env,
    frRuntimeFn: async () => {
      const g4Out = await runFrGraphViaAllowedPath({
        snapshot,
        pack,
        ...frOpts,
        onProgress: opts.onProgress,
        generateJsonFn: opts.generateJsonFn,
        env,
        allowStandaloneFrGraph: opts.allowStandaloneFrGraph,
        frPipelineFn: opts.frPipelineFn,
      });
      return finalizeFrSemanticFromPipeline(g4Out, { ...opts, pack, env }, {
        proposedById,
        frFromCrMeta,
      });
    },
  }).then((sem) => {
    const g4Meta = sem.meta || {};
    return {
      ...sem,
      status: sem.status || TASK_POLICIES.RUN,
      paused: Boolean(g4Meta.g4Out?.paused || sem.meta?.paused),
      blocked: Boolean(g4Meta.g4Out?.blocked || sem.meta?.blocked),
      frUnderstanding: g4Meta.frUnderstanding || sem.semanticOutput,
      conflictAmbiguityGate: g4Meta.conflictAmbiguityGate,
      requirementIntegrityGate:
        g4Meta.requirementIntegrityGate || g4Meta.conflictAmbiguityGate,
      proposalFragment: sem.proposalFragment || g4Meta.proposalFragment || null,
      g4Out: g4Meta.g4Out,
    };
  });
}

module.exports = {
  runFrSemanticTask,
  prepareFrSnapshotForPipeline,
  finalizeFrSemanticFromPipeline,
  failClosedProposedFr,
};
