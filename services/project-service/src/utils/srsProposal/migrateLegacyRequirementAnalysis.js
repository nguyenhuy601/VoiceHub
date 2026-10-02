/**
 * Migrate legacy G4 / requirement analysis → srsProposal projection.
 * Rename of legacy mapping: migrateLegacyRequirementAnalysis.
 *
 * Mapping:
 * - requirements → functionalRequirements.items
 * - relationships → relations
 * - ambiguities → clarificationQuestions
 * - evidence → evidence
 * - legacy synthesis → NOT into functionalRequirements (display-only side field)
 */

const { createEmptySrsProposal } = require('./srsProposalSchema');
const { applyProposalFragment } = require('./srsProposalReducer');
const { frLogicalId } = require('./logicalId');

/**
 * @param {object} legacyG4
 * @param {{ generationId?: string, source?: string }} [opts]
 */
function migrateLegacyRequirementAnalysis(legacyG4, opts = {}) {
  const g4 = legacyG4 && typeof legacyG4 === 'object' ? legacyG4 : {};
  const requirements = Array.isArray(g4.requirements) ? g4.requirements : [];
  const relationships = Array.isArray(g4.relationships) ? g4.relationships : [];
  const ambiguities = Array.isArray(g4.ambiguities) ? g4.ambiguities : [];

  const items = requirements.map((r, i) => ({
    ...r,
    logicalId: frLogicalId(r, i),
    id: String(r.id || r.frId || frLogicalId(r, i)),
    title: r.title || r.name || '',
    description: r.description || r.text || '',
    status: r.status || 'EXTRACTED',
  }));

  const relations = relationships.map((rel, i) => ({
    logicalId: rel.id || `REL-${i}`,
    from: rel.from,
    to: rel.to,
    type: rel.type || 'related',
    note: rel.note || null,
    evidence: rel.evidence || null,
    confidence: rel.confidence ?? null,
  }));

  const clarificationQuestions = ambiguities.map((a, i) => ({
    logicalId: a.id || `CQ-${i}`,
    requirementId: a.requirementId || null,
    kind: a.kind || 'ambiguity',
    message: a.message || a.issue || '',
    status: 'NEEDS_CONFIRMATION',
  }));

  let proposal = createEmptySrsProposal({
    generationId: opts.generationId || g4.meta?.generationId || null,
    source: opts.source || 'legacy_migrate',
    proposalVersion: 0,
  });

  proposal = applyProposalFragment(
    proposal,
    {
      section: 'functionalRequirements',
      items,
      relations,
      clarificationQuestions,
      evidence: g4.evidence || null,
      meta: {
        ...(g4.meta || {}),
        migratedFrom: 'g4Understanding',
        // synthesis intentionally omitted from FR section
      },
    },
    { bumpProposalVersion: true, generationId: opts.generationId }
  );

  // Legacy synthesis → display-only side channel, NEVER functionalRequirements
  if (g4.synthesis != null) {
    proposal.generated._legacySynthesisDisplay = g4.synthesis;
  }

  return proposal;
}

/** @deprecated alias */
const legacyG4ToProposalProjection = migrateLegacyRequirementAnalysis;

module.exports = {
  migrateLegacyRequirementAnalysis,
  legacyG4ToProposalProjection,
};
