/**
 * srsProposal utilities — Analysis Proposal (persist debt name).
 */

module.exports = {
  ...require('./srsProposalSchema'),
  ...require('./srsProposalReducer'),
  ...require('./migrateLegacyRequirementAnalysis'),
  ...require('./logicalId'),
  ...require('./completeness'),
  ...require('./review'),
  ...require('./cas'),
  ...require('./evidence'),
  ...require('./customerRawRecord'),
  ...require('./frInputProjectionBuilder'),
  ...require('./foundation'),
  ...require('./business'),
  ...require('./nfrScope'),
  ...require('./processUcEntity'),
  ...require('./crossSynthesis'),
  ...require('./populateNonFrSections'),
  ...require('./approvedSrsVersionManifest'),
  ...require('./metaGate'),
  ...require('./gate1ReadinessPolicy'),
  ...require('./artifactRevision'),
  ...require('./gateSubmissionManifest'),
  contracts: require('./contracts'),
  engines: require('./engines'),
};
