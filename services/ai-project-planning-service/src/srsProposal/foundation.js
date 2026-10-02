/**
 * Foundation — evidence pack only (Wave 2).
 * RULE-OWNER-01: does NOT write actors/domain/context Analysis sections.
 */

const { buildEvidencePack } = require('./evidence');
const { createEmptySrsProposal } = require('./srsProposalSchema');

/**
 * @param {{ rawRecord?: object, snapshot?: object, actors?: object[], domain?: object, context?: object, evidenceRaw?: object }} input
 */
function buildFoundationUnderstanding(input = {}) {
  const context = {
    ...(input.context || {}),
    snapshotId: input.snapshot?.snapshotId || input.context?.snapshotId || null,
    packId: input.snapshot?.packId || input.context?.packId || null,
    rawRecordId: input.rawRecord?.recordId || input.context?.rawRecordId || null,
  };
  const actors = Array.isArray(input.actors)
    ? input.actors
    : Array.isArray(input.snapshot?.actors)
      ? input.snapshot.actors
      : [];
  const domain =
    input.domain && typeof input.domain === 'object'
      ? input.domain
      : input.snapshot?.domain && typeof input.snapshot.domain === 'object'
        ? input.snapshot.domain
        : {};

  const evidencePack = buildEvidencePack(
    input.evidenceRaw ||
      input.rawRecord?.evidenceRaw || {
        documents: input.rawRecord?.documents || [],
        spans: input.spans || [],
        rows: input.rows || [],
      }
  );

  return {
    context,
    actors,
    domain,
    evidencePack,
  };
}

/**
 * Attach evidencePack to proposal meta only — no actors/domain/context fragments.
 */
function applyFoundationToProposal(proposal, foundation) {
  const next = proposal || createEmptySrsProposal({ source: 'foundation' });
  next.meta = {
    ...(next.meta || {}),
    kind: next.meta?.kind || 'requirement_analysis_proposal',
    evidencePack: foundation?.evidencePack || null,
    foundationContext: foundation?.context || null,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

module.exports = {
  buildFoundationUnderstanding,
  applyFoundationToProposal,
};
