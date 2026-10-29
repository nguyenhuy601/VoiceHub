/**
 * Backlog structure public API.
 */

const constants = require('./constants');
const backlogIdentity = require('./backlogIdentity');
const proposalOperationStore = require('./proposalOperationStore');
const { acceptBacklogCandidates } = require('./acceptBacklogCandidates');
const {
  reconcileBacklogBaseline,
  applyIdentityReviewResolutions,
} = require('./reconcileBacklogBaseline');
const { applyReconcileDecisions } = require('./applyReconcileDecisions');
const { resolveBacklogParents } = require('./resolveBacklogParents');
const { acceptBacklogStructure } = require('./acceptBacklogStructure');
const backlogCoverage = require('./backlogCoverage');
const draftRevision = require('./draftRevision');
const { runBacklogStructurePipeline } = require('./runBacklogStructurePipeline');
const {
  backlogProposeFromSources,
  buildHeuristicCandidates,
} = require('./backlogProposeFromSources');
const {
  assertCanApproveBacklogEntity,
  approveBacklogDraft,
  materializeBacklogStructureFromApproved,
  bindHowToApprovedBaseline,
  markHowStaleOnReapprove,
  purgeFrIdAsStoryId,
  isBacklogStructureShape,
} = require('./gate1AndHow');
const { buildBacklogStructureFromFr } = require('./buildBacklogStructureFromFr');

module.exports = {
  ...constants,
  ...backlogIdentity,
  ...proposalOperationStore,
  acceptBacklogCandidates,
  reconcileBacklogBaseline,
  applyIdentityReviewResolutions,
  applyReconcileDecisions,
  resolveBacklogParents,
  acceptBacklogStructure,
  ...backlogCoverage,
  ...draftRevision,
  runBacklogStructurePipeline,
  backlogProposeFromSources,
  buildHeuristicCandidates,
  assertCanApproveBacklogEntity,
  approveBacklogDraft,
  materializeBacklogStructureFromApproved,
  bindHowToApprovedBaseline,
  markHowStaleOnReapprove,
  purgeFrIdAsStoryId,
  isBacklogStructureShape,
  buildBacklogStructureFromFr,
};
