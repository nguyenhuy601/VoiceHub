/**
 * FR SemanticTask — CR propose + finalize via semantic FR section (frSectionHooks).
 * Production SoT: whatPhaseGraph WhatFrTool → buildWhatSectionToolSubgraph('fr').
 * FR / runFrUnderstanding removed.
 */

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
  /** @type {object[]} */
  let frFromCrEpics = [];
  /** @type {object|null} */
  let frFromCrBacklogStructure = null;

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
        frFromCrEpics,
        frFromCrBacklogStructure,
        frOpts,
      };
    }
    // Wave 1: bind all CR as required + retrieve supplement (2-step RAG)
    let taskContextPackage = opts.contextPackage || null;
    try {
      const { assembleTaskContext } = require('../retrieval/preparePhaseRagContext');
      const crIds = crIntake
        .map((r) => String(r?.externalId || r?.id || r?.sourceId || '').trim())
        .filter(Boolean);
      const taskCtx = await assembleTaskContext({
        phase: 'what',
        snapshot: opts.snapshot,
        snapshotId: opts.snapshot?.snapshotId || opts.snapshotId,
        pack: packIn,
        corpus: opts.corpus,
        sourceIds: crIds,
        rows: crIntake,
        taskPurpose: 'cr_to_fr',
        contextPackage: opts.contextPackage,
        retrievalStatus: opts.contextPackage?.retrievalStatus,
        requireEvidence: true,
        enableAgentic: opts.enableAgentic === true,
        decideRetrieveMoreFn:
          opts.decideRetrieveMoreFn ||
          (opts.enableAgentic === true && opts.generateJsonFn
            ? async ({ contextPackage: cp, missingInformation, round }) => {
                const out = await opts.generateJsonFn({
                  system:
                    'You decide if more retrieval is needed for requirement analysis. Return JSON only.',
                  user: JSON.stringify({
                    decision_options: [
                      'retrieve_more',
                      'generate',
                      'clarify',
                      'stop_incomplete',
                    ],
                    citations: (cp?.citations || []).slice(0, 8),
                    missingInformation,
                    round,
                  }),
                });
                return typeof out === 'string' ? JSON.parse(out) : out;
              }
            : undefined),
        env,
      });
      taskContextPackage = taskCtx.contextPackage;
      frOpts.contextPackage = taskContextPackage;
      frOpts.ragPreCheck = taskCtx.preCheck;
      if (taskCtx.preCheck && taskCtx.preCheck.canGenerate === false) {
        if (taskContextPackage?.inputTooLarge) {
          return {
            failClosed: failClosedProposedFr('input_too_large', {
              splitSuggested: taskContextPackage.splitSuggested,
            }),
            snapshot,
            pack,
            proposedById,
            frFromCrMeta,
            frFromCrEpics,
            frFromCrBacklogStructure,
            frOpts,
          };
        }
      }
    } catch (ragErr) {
      console.warn('[runFrSemanticTask] assembleTaskContext', ragErr?.message || ragErr);
    }
    const proposed = await proposeFrFromCrWithLlm({
      pack: packIn,
      snapshot: opts.snapshot,
      env,
      generateJsonFn: opts.generateJsonFn,
      contextPackage: taskContextPackage,
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
        frFromCrEpics,
        frFromCrBacklogStructure,
        frOpts,
      };
    }
    // Wave 2: post-generate citation check (soft — records status, does not fail-closed yet)
    try {
      const { postGenerateOutputCheck } = require('../retrieval/postGenerateOutputCheck');
      const allowed = new Set([
        ...crIntake.map((r) => String(r?.externalId || r?.id || '').trim()).filter(Boolean),
        ...((taskContextPackage?.citations || []).map((c) => String(c.sourceId || '').trim())),
      ]);
      const postCheck = postGenerateOutputCheck({
        output: { items: proposed.items },
        allowedSourceIds: allowed,
        requiredSourceIds: crIntake
          .map((r) => String(r?.externalId || r?.id || '').trim())
          .filter(Boolean),
      });
      frFromCrMeta = { ...(frFromCrMeta || {}), postGenerateCheck: postCheck };
      if (taskContextPackage) {
        taskContextPackage = {
          ...taskContextPackage,
          postGenerateCheck: postCheck,
        };
        frOpts.contextPackage = taskContextPackage;
      }
    } catch (postErr) {
      console.warn('[runFrSemanticTask] postGenerateOutputCheck', postErr?.message || postErr);
    }
    const overlaid = overlayAnalyzedFr(opts.snapshot, packIn, proposed.items);
    snapshot = overlaid.snapshot;
    pack = overlaid.pack;
    proposedById = new Map(proposed.items.map((row) => [String(row.id), row]));
    frFromCrEpics = Array.isArray(proposed.epics) ? proposed.epics : [];
    frFromCrBacklogStructure =
      proposed.backlogStructure && typeof proposed.backlogStructure === 'object'
        ? proposed.backlogStructure
        : null;
    delete frOpts.priorPartial;
  }

  return {
    snapshot,
    pack,
    proposedById,
    frFromCrMeta,
    frFromCrEpics,
    frFromCrBacklogStructure,
    frOpts,
  };
}

/**
 * Attach backlogStructure via propose+pipeline (Story id ≠ FR id).
 * RULE-E0: never call frDecomposeLlm.
 * R2: non-CR missing parentEpicId → assignFrEpicsLlm then build backlog structure.
 */
async function attachDerivedBacklogStructure(proposalFragment, opts = {}, ctx = {}) {
  const { frItemsHaveEpicMap } = require('../engines/frEpicCatalog');
  const { buildBacklogStructureFromFr } = require('../engines/backlogStructure/buildBacklogStructureFromFr');

  let items = Array.isArray(proposalFragment?.items) ? proposalFragment.items : [];
  let epics = Array.isArray(ctx.frFromCrEpics) ? ctx.frFromCrEpics : [];
  let backlogMeta = null;
  let assignCalls = 0;
  const env = opts.env || process.env;

  // Prefer publishable backlog already built on CR/assign path (not Story=FR).
  const existing = ctx.frFromCrBacklogStructure || proposalFragment.backlogStructure;
  if (
    existing &&
    typeof existing === 'object' &&
    existing.meta?.shapeVersion === 'backlog-structure' &&
    Array.isArray(existing.stories) &&
    existing.stories.length
  ) {
    proposalFragment.backlogStructure = existing;
    backlogMeta = {
      backlogSource: existing.meta?.backlogSource || 'backlog_structure',
      llmCalls: 0,
      shapeVersion: existing.meta.shapeVersion,
      fromFrFromCr: Boolean(ctx.frFromCrBacklogStructure),
    };
    return { backlogMeta, assignCalls };
  }

  if (!frItemsHaveEpicMap(items)) {
    const { assignFrEpicsWithLlm } = require('../engines/assignFrEpicsLlm');
    const assigned = await assignFrEpicsWithLlm({
      proposalItems: items,
      env,
      generateJsonFn: opts.generateJsonFn,
      packId: opts.packId || ctx.pack?.id || 'pack',
      sourceSnapshotVersion: opts.sourceSnapshotVersion,
    });
    assignCalls = Number(assigned.meta?.llmCalls) || 0;
    if (!assigned.ok) {
      proposalFragment.meta = {
        ...(proposalFragment.meta || {}),
        frEpicAssignFailed: true,
        frEpicAssignReason: assigned.meta?.fallbackReason || 'assign_fr_epics_failed',
      };
      return { backlogMeta: assigned.meta || { ok: false }, assignCalls };
    }
    proposalFragment.items = assigned.items;
    items = assigned.items;
    epics = assigned.epics || epics;
    if (assigned.backlogStructure) {
      proposalFragment.backlogStructure = assigned.backlogStructure;
      backlogMeta = {
        ...(assigned.meta || {}),
        backlogSource: assigned.backlogStructure.meta?.backlogSource || 'backlog_structure',
        shapeVersion: assigned.backlogStructure.meta?.shapeVersion,
      };
      return { backlogMeta, assignCalls };
    }
  } else if (!epics.length) {
    const catalog = [];
    const seen = new Set();
    for (const row of items) {
      const pid =
        row.parentEpicId === undefined || row.parentEpicId === null || row.parentEpicId === ''
          ? null
          : String(row.parentEpicId).trim();
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      catalog.push({ id: pid, name: pid });
    }
    epics = catalog;
  }

  const built = await buildBacklogStructureFromFr({
    frItems: items,
    epicsCatalog: epics,
    packId: opts.packId || ctx.pack?.id || 'pack',
    sourceSnapshotVersion: opts.sourceSnapshotVersion,
    generateJsonFn: opts.generateJsonFn,
    env,
    approvedBaseline: opts.approvedBaseline,
    currentDraft: opts.currentDraft,
    expectedDraftRevisionId: opts.expectedDraftRevisionId,
    currentDraftRevisionId: opts.currentDraftRevisionId,
    identityResolutions: opts.identityResolutions,
  });
  if (built.ok && built.backlogStructure) {
    proposalFragment.backlogStructure = built.backlogStructure;
    backlogMeta = {
      backlogSource: 'backlog_structure',
      llmCalls: assignCalls,
      shapeVersion: built.backlogStructure.meta?.shapeVersion,
      draftRevisionId: built.draftRevisionId,
    };
    return { backlogMeta, assignCalls };
  }

  proposalFragment.meta = {
    ...(proposalFragment.meta || {}),
    backlogStructureFailed: true,
    backlogStructureCode: built.code || 'backlog_structure_failed',
    backlogStructureNeedsReview: Boolean(built.needsReview),
    identityReview: built.identityReview || [],
  };
  return {
    backlogMeta: { ok: false, code: built.code, needsReview: built.needsReview },
    assignCalls,
  };
}

/**
 * Build FR semantic result from pipeline output (proposal + integrity + FR+epic derive).
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

  const { backlogMeta, assignCalls } = await attachDerivedBacklogStructure(
    proposalFragment,
    opts,
    ctx
  );

  const g4Calls =
    Number(frUnderstanding?.meta?.llm?.calls) || (frUnderstanding?.meta?.llm ? 1 : 0);

  return {
    items: proposalFragment?.items || [],
    llmCalls: g4Calls + assignCalls,
    semanticOutput: frUnderstanding,
    proposalFragment,
    coverage: { status: 'AVAILABLE' },
    meta: {
      conflictAmbiguityGate,
      requirementIntegrityGate,
      g4Out,
      frEpicBacklog: backlogMeta,
      frFromCr: frFromCrMeta,
    },
    frUnderstanding,
    conflictAmbiguityGate,
    requirementIntegrityGate,
    g4Out,
  };
}

async function runFrSemanticTask(opts = {}) {
  if (typeof opts.frPipelineFn === 'function') {
    return opts.frPipelineFn(opts);
  }
  const { runFrSectionDerive } = require('./frSectionHooks');
  return runFrSectionDerive(opts);
}

module.exports = {
  runFrSemanticTask,
  prepareFrSnapshotForPipeline,
  finalizeFrSemanticFromPipeline,
  attachDerivedBacklogStructure,
  failClosedProposedFr,
};
