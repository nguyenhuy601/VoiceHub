/**
 * Mirror of project-service AnalysisEngineContract (FR emit path).
 * SoT comments: keep in sync with services/project-service/.../contracts/
 */

const ORIGIN_TYPES = Object.freeze([
  'EXTRACTED',
  'NORMALIZED',
  'HEURISTIC',
  'DERIVED',
  'AI_SYNTHESIS',
]);

function normalizeOrigin(raw, hints = {}) {
  if (hints.derived) return 'DERIVED';
  if (hints.heuristic) return 'HEURISTIC';
  const s = String(raw || '').trim().toUpperCase();
  if (ORIGIN_TYPES.includes(s)) return s;
  if (s === 'BUSINESS_RULE' || s === 'BR_TO_FR') return 'DERIVED';
  if (!s || s === 'FR_EXTRACT' || s === 'EXTRACT') return 'EXTRACTED';
  return 'EXTRACTED';
}

function normalizeProposalItem(item, opts = {}) {
  const raw = item && typeof item === 'object' ? item : {};
  const index = opts.index ?? 0;
  const logicalId = String(raw.logicalId || raw.id || raw.frId || `FR-${index + 1}`).trim();
  const derivedFromBr = Boolean(raw.derivedFromBr || raw.sourceKind === 'business_rule');
  const originType = normalizeOrigin(raw.origin?.type || raw.origin, {
    derived: derivedFromBr,
    heuristic: String(raw.provenance?.type || '').toUpperCase() === 'HEURISTIC',
  });
  let status = String(raw.status || 'EXTRACTED').toUpperCase();
  if (derivedFromBr || originType === 'DERIVED') status = 'PROPOSED';

  const provenance =
    raw.provenance && typeof raw.provenance === 'object'
      ? {
          type: String(raw.provenance.type || originType).toUpperCase(),
          derivedFrom: Array.isArray(raw.provenance.derivedFrom)
            ? raw.provenance.derivedFrom.map(String)
            : [],
          rule: raw.provenance.rule || null,
        }
      : derivedFromBr
        ? {
            type: 'DERIVED',
            derivedFrom: [String(raw.derivedFromBr || '')].filter(Boolean),
            rule: 'BR_TO_FR',
          }
        : { type: originType, derivedFrom: [], rule: null };

  return {
    ...raw,
    logicalId,
    id: raw.id || logicalId,
    title: raw.title || raw.name || logicalId,
    description: raw.description || raw.text || '',
    status,
    origin: {
      type: originType,
      engine: opts.engineId || raw.origin?.engine || 'fr',
      section: opts.section || 'functionalRequirements',
    },
    provenance,
    sourceRefs: Array.isArray(raw.sourceRefs)
      ? raw.sourceRefs
      : Array.isArray(raw.evidence)
        ? raw.evidence
        : [],
  };
}

function assertBrDerivedFrInvariant(item) {
  const rawStatus = String(item?.status || '').toUpperCase();
  const isDerived =
    Boolean(item?.derivedFromBr) ||
    item?.sourceKind === 'business_rule' ||
    String(item?.origin?.type || '').toUpperCase() === 'DERIVED';
  if (isDerived && (rawStatus === 'ACCEPTED' || rawStatus === 'APPROVED')) {
    const err = new Error('BR-derived FR must remain PROPOSED (RULE-BR-FR-01)');
    err.code = 'BR_FR_INVARIANT';
    throw err;
  }
  const normalized = normalizeProposalItem(item);
  if (!isDerived) return normalized;
  normalized.status = 'PROPOSED';
  return normalized;
}

function createEngineResult(partial = {}) {
  const failed = String(partial.execution?.status || 'SUCCESS').toUpperCase() === 'FAILED';
  return {
    execution: {
      status: failed ? 'FAILED' : 'SUCCESS',
      diagnostics: Array.isArray(partial.execution?.diagnostics)
        ? partial.execution.diagnostics
        : [],
    },
    items: Array.isArray(partial.items) ? partial.items : [],
    relations: Array.isArray(partial.relations) ? partial.relations : [],
    clarificationQuestions: Array.isArray(partial.clarificationQuestions)
      ? partial.clarificationQuestions
      : [],
    coverage: failed
      ? null
      : {
          status: partial.coverage?.status || (partial.items?.length ? 'AVAILABLE' : 'NO_DATA'),
          reason: partial.coverage?.reason || null,
          sourceStats: partial.coverage?.sourceStats || null,
        },
    validation: {
      errors: Array.isArray(partial.validation?.errors) ? partial.validation.errors : [],
      warnings: Array.isArray(partial.validation?.warnings) ? partial.validation.warnings : [],
    },
    meta: {
      engineId: partial.meta?.engineId || 'fr',
      section: partial.meta?.section || 'functionalRequirements',
      version: partial.meta?.version || 1,
      ...(partial.meta || {}),
    },
  };
}

function assertEngineResultShape(result) {
  if (!result?.execution?.status || !Array.isArray(result.items)) {
    const err = new Error('Invalid EngineResult');
    err.code = 'INVALID_ENGINE_RESULT';
    throw err;
  }
  return true;
}

function assertNoSrsDraftInEngineResult(result) {
  if (result?.srsDraft != null) {
    const err = new Error('Engines must not produce srsDraft');
    err.code = 'ENGINE_SRS_BOUNDARY';
    throw err;
  }
  return true;
}

module.exports = {
  ORIGIN_TYPES,
  normalizeOrigin,
  normalizeProposalItem,
  assertBrDerivedFrInvariant,
  createEngineResult,
  assertEngineResultShape,
  assertNoSrsDraftInEngineResult,
};
