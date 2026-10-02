/**
 * PLAN A — WHAT macro-step boundaries (orchestration labels only).
 * Does not change snapshot/Qdrant storage (PLAN B).
 */

const MACRO = Object.freeze({
  INPUT: 1,
  UNDERSTANDING: 2,
  SEMANTIC_FETCH: 3,
  AGENTIC: 4,
  GATE1: 5,
  APPROVED_SRS: 6,
});

/** Substeps that belong to Requirement Understanding (Step 2). */
const STEP2_SUBSTEPS = Object.freeze([
  'parse',
  'normalize',
  'extract',
  'filter',
  'quality',
]);

/** Substeps for Semantic Fetch (Step 3) — retrieval / context only. */
const STEP3_SUBSTEPS = Object.freeze([
  'context_fetch',
  'assemble_context',
  'semantic',
  'conflict',
]);

/** Substeps inside Agentic Orchestration (Step 4). */
const STEP4_SUBSTEPS = Object.freeze([
  'agent_understand',
  'plan',
  'validate',
  'synthesis',
  'evidence',
  'derive',
  'observe',
  'evaluate_local',
  'meta_gate',
]);

/**
 * @param {string} substep
 * @returns {{ step: number, substep: string } | null}
 */
function macroForSubstep(substep) {
  const id = String(substep || '').trim();
  if (!id) return null;
  if (id === 'prepare') return { step: MACRO.INPUT, substep: id };
  if (STEP2_SUBSTEPS.includes(id)) return { step: MACRO.UNDERSTANDING, substep: id };
  if (STEP3_SUBSTEPS.includes(id)) return { step: MACRO.SEMANTIC_FETCH, substep: id };
  if (STEP4_SUBSTEPS.includes(id) || id.startsWith('engine_')) {
    return { step: MACRO.AGENTIC, substep: id };
  }
  // Legacy HITL Data Gate — no longer a business macro step
  if (id === 'gate_preview' || id === 'gate') {
    return { step: MACRO.UNDERSTANDING, substep: 'quality' };
  }
  return null;
}

module.exports = {
  MACRO,
  STEP2_SUBSTEPS,
  STEP3_SUBSTEPS,
  STEP4_SUBSTEPS,
  macroForSubstep,
};
