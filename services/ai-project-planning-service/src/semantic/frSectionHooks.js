/**
 * WhatFrTool → src/semantic FR path (no FR / runFrUnderstanding).
 * Reuses CR→FR + epic/backlog derive; builds a lite frUnderstanding for proposal/Gate compat.
 */

const { TASK_POLICIES } = require('./semanticTaskRegistry');
const { HIERARCHY_PROMPT_RULES } = require('./hierarchyPromptRules');
const {
  prepareFrSnapshotForPipeline,
  finalizeFrSemanticFromPipeline,
  failClosedProposedFr,
} = require('./runFrSemanticTask');

/**
 * Build lite understanding from proposed/analyzed FR rows (replaces FR graph output).
 * @param {object[]} requirements
 * @param {object} [meta]
 */
function buildLiteFrUnderstanding(requirements = [], meta = {}) {
  const reqs = (Array.isArray(requirements) ? requirements : []).map((row, i) => ({
    id: String(row.id || row.logicalId || row.frId || `FR-${i + 1}`).trim(),
    title: row.title || row.name || null,
    name: row.name || row.title || null,
    description: row.description || row.text || null,
    ac: row.ac || row.acceptanceCriteria || null,
    acceptanceCriteria: row.ac || row.acceptanceCriteria || null,
    priority: row.priority || null,
    actors: Array.isArray(row.actors) ? row.actors : row.actor ? [row.actor] : [],
    parentEpicId: row.parentEpicId,
    sourceCrIds: Array.isArray(row.sourceCrIds) ? row.sourceCrIds : [],
    sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : [],
    status: row.status || 'PROPOSED',
  }));
  return {
    requirements: reqs,
    relationships: [],
    ambiguities: [],
    assumptions: [],
    evidence: null,
    semanticItems: [],
    conflicts: [],
    synthesis: null,
    signalsMeta: { total: reqs.length, candidates: 0, clear: reqs.length },
    meta: {
      pipeline: 'semantic_fr_section_v1',
      llmCalls: Number(meta.llmCalls) || 0,
      partial: false,
      ...meta,
    },
  };
}

/**
 * Optional RequirementAnalysisTool facts → ambiguities (no frUnderstanding).
 */
function enrichWithRequirementAnalysis(lite, snapshot, pack) {
  try {
    const { requirementAnalysis } = require('../tools/requirementAnalysis');
    // Sync-looking API is async — caller must await; we keep sync try via then not used here.
    return { lite, analysisPromise: requirementAnalysis(snapshot || { functionalRequirements: lite.requirements }, { pack }) };
  } catch {
    return { lite, analysisPromise: null };
  }
}

/**
 * Production WhatFr entry: CR→FR / analyzed FR → proposal + backlogStructure.
 * @param {object} opts
 */
async function runFrSectionDerive(opts = {}) {
  const env = opts.env || process.env;
  const prepared = await prepareFrSnapshotForPipeline({
    snapshot: opts.snapshot,
    pack: opts.pack || {},
    frOpts: opts.frOpts || {},
    env,
    generateJsonFn: opts.generateJsonFn,
  });

  if (prepared.failClosed) {
    return prepared.failClosed;
  }

  const {
    snapshot,
    pack,
    proposedById,
    frFromCrMeta,
    frFromCrEpics,
    frFromCrBacklogStructure,
  } = prepared;

  let requirements = [];
  let llmCalls = Number(frFromCrMeta?.llmCalls) || 0;

  if (proposedById && proposedById.size) {
    requirements = [...proposedById.values()];
  } else {
    const { listFrs } = require('../tools/requirementAnalysis');
    const { isCustomerRequirementId } = require('../engines/frProposeFromCrLlm');
    const rows = listFrs(snapshot || pack || {});
    requirements = rows
      .filter((row) => !isCustomerRequirementId(row?.id || row?.externalId || row?.logicalId))
      .map((row, i) => ({
        id: String(row.id || row.externalId || row.logicalId || `FR-${i + 1}`).trim(),
        title: row.title || row.name || null,
        name: row.name || row.title || null,
        description: row.description || row.desc || null,
        ac: row.ac || row.acceptanceCriteria || null,
        priority: row.priority || null,
        actors: row.actors || (row.actor ? [row.actor] : []),
        parentEpicId: row.parentEpicId,
        sourceCrIds: row.sourceCrIds,
        sourceRefs: row.sourceRefs,
        status: 'EXTRACTED',
      }));
  }

  if (!requirements.length) {
    return failClosedProposedFr('FR_EMPTY_AFTER_PREPARE', frFromCrMeta);
  }

  let lite = buildLiteFrUnderstanding(requirements, {
    llmCalls,
    frFromCr: Boolean(frFromCrMeta),
  });

  try {
    const { requirementAnalysis } = require('../tools/requirementAnalysis');
    const analysis = await requirementAnalysis(
      {
        ...(snapshot || {}),
        functionalRequirements: requirements,
        snapshotId: opts.snapshotId || snapshot?.snapshotId || null,
      },
      { pack }
    );
    const facts = analysis?.result || analysis || {};
    if (Array.isArray(facts.ambiguities) && facts.ambiguities.length) {
      lite.ambiguities = facts.ambiguities;
    }
    if (Array.isArray(facts.relationships) && facts.relationships.length) {
      lite.relationships = facts.relationships;
    }
    lite.facts = facts.facts || {};
    lite.meta = {
      ...(lite.meta || {}),
      requirementAnalysis: true,
    };
  } catch {
    /* quality optional */
  }

  const g4Out = {
    frUnderstanding: lite,
    validation: { ok: true, accepted: lite.relationships || [], rejected: [] },
    projected: null,
    selection: { counts: lite.signalsMeta },
  };

  const finalized = await finalizeFrSemanticFromPipeline(
    g4Out,
    {
      runId: opts.runId || null,
      pack,
      env,
      generateJsonFn: opts.generateJsonFn,
    },
    {
      proposedById: proposedById || new Map(),
      frFromCrMeta,
      frFromCrEpics: frFromCrEpics || [],
      frFromCrBacklogStructure: frFromCrBacklogStructure || null,
    }
  );

  return {
    status: TASK_POLICIES.RUN,
    items: finalized.items || [],
    llmCalls: Number(finalized.llmCalls) || llmCalls,
    proposalFragment: finalized.proposalFragment,
    coverage: finalized.coverage || { status: 'AVAILABLE' },
    semanticOutput: finalized.frUnderstanding || lite,
    frUnderstanding: finalized.frUnderstanding || lite,
    conflictAmbiguityGate: finalized.conflictAmbiguityGate,
    requirementIntegrityGate: finalized.requirementIntegrityGate,
    meta: {
      ...(finalized.meta || {}),
      pipeline: 'semantic_fr_section_v1',
      hierarchyRules: 'H1-H6',
    },
  };
}

module.exports = {
  HIERARCHY_PROMPT_RULES,
  buildLiteFrUnderstanding,
  runFrSectionDerive,
  enrichWithRequirementAnalysis,
};
