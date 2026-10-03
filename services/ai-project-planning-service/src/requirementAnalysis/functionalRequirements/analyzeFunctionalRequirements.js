/**
 * Functional Requirement Analysis entry (Wave 0).
 * Extract → G4 Semantic Engine → Validate → FR Proposal fragment.
 *
 * Does NOT persist. Does NOT write analyses.g4Understanding.
 * Synthesis is excluded from FRAnalysisResult (T-G4-04); owned by W6.
 */

const { extractFunctionalRequirements } = require('./extractFunctionalRequirements');
const { runG4SemanticAnalysis } = require('./g4SemanticAnalysis');
const { validateFunctionalRequirements } = require('./validateFunctionalRequirements');
const { buildFunctionalRequirementProposal } = require('./buildFunctionalRequirementProposal');
const {
  fromLegacyG4Input,
  toLegacyG4SemanticInput,
} = require('./legacyFrInputProjectionAdapter');
const { normalizeSemanticOutput } = require('./normalizeSemanticOutput');

/**
 * @param {{
 *   frInputProjection?: object,
 *   legacyG4Input?: object,
 *   snapshot?: object,
 *   env?: object,
 *   generateJsonFn?: Function,
 *   skipLlm?: boolean,
 *   forceHeuristic?: boolean,
 *   onProgress?: Function,
 *   pauseAtDataGate?: boolean,
 *   priorPartial?: object,
 *   generationId?: string,
 *   proposalVersion?: number,
 * }} opts
 */
async function analyzeFunctionalRequirements(opts = {}) {
  const frInputProjection =
    opts.frInputProjection ||
    (opts.legacyG4Input || opts.snapshot
      ? fromLegacyG4Input(opts.legacyG4Input || opts.snapshot)
      : { requirements: [], context: {}, actors: [], domain: {}, evidencePack: null });

  // W0 Option A: FR projection must not include process
  if (frInputProjection.process != null) {
    const { process: _drop, ...rest } = frInputProjection;
    Object.assign(frInputProjection, rest);
    delete frInputProjection.process;
  }

  const extractResult = extractFunctionalRequirements(frInputProjection);

  const g4Out = await runG4SemanticAnalysis({
    frInputProjection,
    extractResult,
    snapshot: opts.snapshot
      ? opts.snapshot
      : toLegacyG4SemanticInput({
          ...frInputProjection,
          requirements: extractResult.extracted,
        }),
    env: opts.env,
    generateJsonFn: opts.generateJsonFn,
    skipLlm: opts.skipLlm,
    forceHeuristic: opts.forceHeuristic,
    onProgress: opts.onProgress,
    pauseAtDataGate: opts.pauseAtDataGate,
    priorPartial: opts.priorPartial,
  });

  if (g4Out?.paused || g4Out?.blocked) {
    return {
      paused: Boolean(g4Out.paused),
      blocked: Boolean(g4Out.blocked),
      errorCode: g4Out.errorCode || null,
      gatePreview: g4Out.gatePreview || null,
      partial: g4Out.partial || null,
      frAnalysisResult: null,
      proposalFragment: null,
    };
  }

  const g4Understanding = g4Out.g4Understanding || {};
  // Drop synthesis from FR semantic path (T-G4-04)
  const { synthesis: _syn, ...semanticWithoutSynthesis } = g4Understanding;

  const validated = validateFunctionalRequirements({
    g4Understanding: semanticWithoutSynthesis,
    validation: g4Out.validation,
  });

  const proposalFragment = buildFunctionalRequirementProposal({
    validated,
    generationId: opts.generationId,
    proposalVersion: opts.proposalVersion,
  });

  // RULE-BR-FR-01: preserve PROPOSED for BR-derived extracts through G4 path
  const extractById = new Map(
    (extractResult.extracted || []).map((r) => [String(r.id || r.frId), r])
  );
  proposalFragment.items = (proposalFragment.items || []).map((item) => {
    const src = extractById.get(String(item.id || item.logicalId));
    if (src && (src.derivedFromBr || src.sourceKind === 'business_rule' || src.status === 'PROPOSED')) {
      return {
        ...item,
        status: 'PROPOSED',
        derivedFromBr: src.derivedFromBr || item.derivedFromBr,
        sourceKind: src.sourceKind || item.sourceKind || 'business_rule',
      };
    }
    return item;
  });

  const frAnalysisResult = {
    requirements: validated.accepted.requirements,
    relationships: validated.accepted.relationships,
    ambiguities: validated.accepted.ambiguities,
    assumptions: validated.accepted.assumptions,
    evidence: validated.accepted.evidence,
    semanticItems: validated.accepted.semanticItems,
    conflicts: validated.accepted.conflicts,
    facts: validated.accepted.facts,
    signalsMeta: validated.accepted.signalsMeta,
    meta: {
      ...(validated.accepted.meta || {}),
      validationOk: validated.ok,
      validationErrors: validated.errors,
      validationWarnings: validated.warnings,
    },
    // Explicit absence — callers must not treat synthesis as FR output
    synthesis: undefined,
  };

  return {
    paused: false,
    blocked: false,
    frAnalysisResult,
    proposalFragment,
    /** Legacy-compatible semantic blob for parity tests only — no persist */
    legacySemantic: semanticWithoutSynthesis,
    normalizedSemantic: normalizeSemanticOutput(semanticWithoutSynthesis),
    projected: g4Out.projected,
    validation: g4Out.validation,
    selection: g4Out.selection,
    skill: g4Out.skill,
    model: g4Out.model,
  };
}

module.exports = {
  analyzeFunctionalRequirements,
  extractFunctionalRequirements,
  validateFunctionalRequirements,
  buildFunctionalRequirementProposal,
  fromLegacyG4Input,
  toLegacyG4SemanticInput,
  normalizeSemanticOutput,
};
