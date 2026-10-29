/**
 * Build Functional Requirement Proposal fragment for section-scoped reducer.
 * T-FR-04: synthesis must NOT be part of FR analysis result / FR fragment.
 * Emits Analysis ProposalItem contract (origin, provenance, sourceRefs).
 */

const {
  normalizeProposalItem,
  assertBrDerivedFrInvariant,
} = require('../contracts/proposalItem');

function mapRequirementStatus(req) {
  const raw = String(req?.status || '').toUpperCase();
  if (req?.derivedFromBr || req?.sourceKind === 'business_rule') return 'PROPOSED';
  if (raw === 'PROPOSED' || raw === 'EXTRACTED' || raw === 'ACCEPTED') return raw;
  return 'EXTRACTED';
}

/**
 * @param {{ validated: object, generationId?: string, proposalVersion?: number }} opts
 */
function buildFunctionalRequirementProposal(opts = {}) {
  const validated = opts.validated && typeof opts.validated === 'object' ? opts.validated : {};
  const accepted = validated.accepted || {};
  const requirements = Array.isArray(accepted.requirements) ? accepted.requirements : [];

  const items = requirements.map((r, idx) => {
    const id = String(r.id || r.frId || `FR-${idx + 1}`);
    const derived = Boolean(r.derivedFromBr || r.sourceKind === 'business_rule');
    const sourceCrIds = Array.isArray(r.sourceCrIds)
      ? r.sourceCrIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const proposedFromCr = sourceCrIds.length > 0 && !derived;
    const acText = String(r.ac || r.acceptanceCriteria || '').trim();
    const parentEpicId =
      r.parentEpicId === undefined || r.parentEpicId === null || r.parentEpicId === ''
        ? r.parentEpicId === null
          ? null
          : undefined
        : String(r.parentEpicId).trim();
    const base = {
      logicalId: id,
      id,
      title: r.title || r.name || id,
      description: r.description || r.text || '',
      // Preserve intake AC (Customer Raw "Acceptance / Expected Result") for Gate1 FR column
      ac: acText || null,
      acceptanceCriteria: acText || null,
      status: mapRequirementStatus(r),
      priority: r.priority || null,
      actors: Array.isArray(r.actors) ? r.actors : [],
      // FR+epic one-shot: keep parentEpicId for Gate1 Epic column + derive
      ...(parentEpicId !== undefined ? { parentEpicId } : {}),
      sourceCrIds,
      sourceRefs: Array.isArray(r.sourceRefs)
        ? r.sourceRefs
        : sourceCrIds.length
          ? sourceCrIds.map((cr) => ({ type: 'customer_raw', id: cr }))
          : Array.isArray(r.evidence)
            ? r.evidence
            : [],
      derivedFromBr: r.derivedFromBr || null,
      sourceKind: r.sourceKind || null,
      origin: derived
        ? { type: 'DERIVED', engine: 'fr', section: 'functionalRequirements' }
        : proposedFromCr
          ? { type: 'AI_SYNTHESIS', engine: 'fr_from_cr', section: 'functionalRequirements' }
          : { type: 'EXTRACTED', engine: 'fr', section: 'functionalRequirements' },
      provenance: derived
        ? {
            type: 'DERIVED',
            derivedFrom: [String(r.derivedFromBr || '')].filter(Boolean),
            rule: 'BR_TO_FR',
          }
        : proposedFromCr
          ? {
              type: 'AI_SYNTHESIS',
              derivedFrom: sourceCrIds,
              rule: 'CR_TO_FR',
            }
          : { type: 'EXTRACTED', derivedFrom: [], rule: null },
    };
    return assertBrDerivedFrInvariant(
      normalizeProposalItem(base, {
        index: idx,
        engineId: 'fr',
        section: 'functionalRequirements',
        defaultPrefix: 'FR',
      })
    );
  });

  const relations = (Array.isArray(accepted.relationships) ? accepted.relationships : []).map(
    (rel, i) => ({
      logicalId: rel.id || `REL-${rel.from || 'x'}-${rel.to || i}`,
      from: rel.from,
      to: rel.to,
      type: rel.type || 'related',
      note: rel.note || null,
      evidence: rel.evidence || null,
      confidence: rel.confidence ?? null,
    })
  );

  const clarificationQuestions = (
    Array.isArray(accepted.ambiguities) ? accepted.ambiguities : []
  ).map((a, i) => ({
    logicalId: a.id || `CQ-${a.requirementId || i}`,
    requirementId: a.requirementId || null,
    kind: a.kind || 'ambiguity',
    message: a.message || a.issue || '',
    status: 'NEEDS_CONFIRMATION',
  }));

  const out = {
    section: 'functionalRequirements',
    items,
    relations,
    clarificationQuestions,
    evidence: accepted.evidence || null,
    meta: {
      ...(accepted.meta || {}),
      generationId: opts.generationId || accepted.meta?.generationId || null,
      proposalVersion: opts.proposalVersion ?? 1,
      engineId: 'fr',
      hasSynthesis: false,
    },
  };
  // Optional: attached later by runFrSemanticTask via backlogStructure pipeline.
  if (opts.backlogStructure && typeof opts.backlogStructure === 'object') {
    out.backlogStructure = opts.backlogStructure;
  }
  return out;
}

module.exports = { buildFunctionalRequirementProposal, mapRequirementStatus };
