/**
 * Change markers follow relations. Approved results and frozen snapshots stay put.
 */

const IMPACT_WHEN_TARGET_CHANGES = new Set([
  'depends_on',
  'verifies',
  'implements',
  'derived_from',
]);

function collectImpact({ changedEntityId, relations = [] }) {
  const review = new Set();
  const queue = [changedEntityId];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const rel of relations) {
      if (rel.to === current && IMPACT_WHEN_TARGET_CHANGES.has(rel.type)) {
        review.add(rel.from);
        queue.push(rel.from);
      }
    }
  }
  review.delete(changedEntityId);
  return [...review].sort();
}

function planChange({ changedEntityId, relations = [], frozenSnapshotIds = [] }) {
  return {
    reviewEntityIds: collectImpact({ changedEntityId, relations }),
    invalidateCachesForEntity: changedEntityId,
    replacesApprovedResults: false,
    rerunEntirePipeline: false,
    frozenSnapshotIds: [...frozenSnapshotIds],
  };
}

module.exports = {
  collectImpact,
  planChange,
};
