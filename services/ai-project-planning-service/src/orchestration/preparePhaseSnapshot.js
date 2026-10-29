/**
 * Shared snapshot prep for WHAT/HOW phase runners (not an agent loop facade).
 */

function preparePhaseSnapshot({
  snapshotId = null,
  snapshot = null,
  runId = null,
  phase = null,
  pack = {},
} = {}) {
  const { assertSnapshotBoundary } = require('../knowledge/assertSnapshotBoundary');
  const bound = assertSnapshotBoundary({
    snapshotId,
    snapshot,
    runId,
    phase,
  });

  let boundSnapshot = bound.snapshot;
  try {
    const { attachKnowledgeCatalogs } = require('../knowledge/attachKnowledgeCatalogs');
    const attachInput = {
      ...boundSnapshot,
      pack,
      staffingPlan: boundSnapshot.staffingPlan || pack?.staffingPlan,
      requirementSkills:
        boundSnapshot.requirementSkills || pack?.requirementSkills,
    };
    boundSnapshot = attachKnowledgeCatalogs(attachInput).snapshot;
  } catch {
    /* keep boundary snapshot */
  }

  return {
    snapshotId: bound.snapshotId,
    snapshot: boundSnapshot,
  };
}

module.exports = { preparePhaseSnapshot };
