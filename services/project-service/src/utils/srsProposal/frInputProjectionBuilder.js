/**
 * FrInputProjectionBuilder (W1+) — Option A: no process in FR input.
 * Local mapping only (no cross-service require).
 */

function buildFrInputProjection(parts = {}) {
  const requirements = Array.isArray(parts.requirements)
    ? parts.requirements
    : Array.isArray(parts.functionalRequirements)
      ? parts.functionalRequirements
      : [];
  const projection = {
    requirements,
    context: parts.context && typeof parts.context === 'object' ? parts.context : {},
    actors: Array.isArray(parts.actors) ? parts.actors : [],
    domain: parts.domain && typeof parts.domain === 'object' ? parts.domain : {},
    evidencePack: parts.evidencePack || null,
  };
  if ('process' in projection) delete projection.process;
  if ('processes' in projection) delete projection.processes;
  return projection;
}

function buildFrInputProjectionFromLegacy(legacy) {
  const snap = legacy && typeof legacy === 'object' ? legacy : {};
  return buildFrInputProjection({
    requirements: snap.functionalRequirements || snap.requirements,
    context: snap.context || {
      snapshotId: snap.snapshotId,
      packId: snap.packId,
      projectId: snap.projectId,
    },
    actors: snap.actors,
    domain: snap.domain,
    evidencePack: snap.evidencePack || snap.evidence,
  });
}

module.exports = {
  buildFrInputProjection,
  buildFrInputProjectionFromLegacy,
};
