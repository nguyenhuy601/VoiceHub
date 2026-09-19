const { PlanningRun } = require('../run/PlanningRun.model');

/**
 * G15 Checkpoint store — persist agent state JSON on PlanningRun (≠ G19 lifecycle).
 */

async function saveCheckpoint(runId, agentState) {
  const doc = await PlanningRun.findByIdAndUpdate(
    runId,
    {
      $set: {
        checkpoint: {
          state: agentState && typeof agentState === 'object' ? agentState : {},
          savedAt: new Date().toISOString(),
        },
      },
    },
    { new: true }
  ).lean();
  return doc?.checkpoint || null;
}

async function loadCheckpoint(runId) {
  const doc = await PlanningRun.findById(runId).select('checkpoint snapshotId').lean();
  if (!doc) return null;
  return {
    checkpoint: doc.checkpoint || null,
    snapshotId: doc.snapshotId,
  };
}

module.exports = { saveCheckpoint, loadCheckpoint };
