/**
 * ONE compatibility boundary between legacy G4 snapshot input and FR input projection.
 * Do not add a second parallel mapping module.
 */

/**
 * Legacy G4 / WHAT snapshot → frInputProjection (W0 Option A: no process).
 * @param {object} legacyInput
 * @returns {{ requirements: object[], context: object, actors: object[], domain: object, evidencePack: object|null }}
 */
function fromLegacyG4Input(legacyInput = {}) {
  const snap = legacyInput && typeof legacyInput === 'object' ? legacyInput : {};
  const requirements = Array.isArray(snap.functionalRequirements)
    ? snap.functionalRequirements
    : Array.isArray(snap.requirements)
      ? snap.requirements
      : [];
  const context =
    snap.context && typeof snap.context === 'object'
      ? snap.context
      : {
          snapshotId: snap.snapshotId || snap.id || null,
          packId: snap.packId || null,
          projectId: snap.projectId || null,
        };
  const actors = Array.isArray(snap.actors)
    ? snap.actors
    : Array.isArray(snap.context?.actors)
      ? snap.context.actors
      : [];
  const domain =
    snap.domain && typeof snap.domain === 'object'
      ? snap.domain
      : snap.context?.domain && typeof snap.context.domain === 'object'
        ? snap.context.domain
        : {};
  const evidencePack =
    snap.evidencePack && typeof snap.evidencePack === 'object'
      ? snap.evidencePack
      : snap.evidence && typeof snap.evidence === 'object'
        ? snap.evidence
        : null;

  return {
    requirements,
    context,
    actors,
    domain,
    evidencePack,
  };
}

/**
 * frInputProjection → shape consumable by existing G4 normalize/listFrs path.
 * @param {object} frInputProjection
 * @returns {object}
 */
function toLegacyG4SemanticInput(frInputProjection = {}) {
  const proj =
    frInputProjection && typeof frInputProjection === 'object' ? frInputProjection : {};
  const requirements = Array.isArray(proj.requirements) ? proj.requirements : [];
  return {
    snapshotId: proj.context?.snapshotId || null,
    packId: proj.context?.packId || null,
    projectId: proj.context?.projectId || null,
    functionalRequirements: requirements,
    requirements,
    actors: Array.isArray(proj.actors) ? proj.actors : [],
    domain: proj.domain && typeof proj.domain === 'object' ? proj.domain : {},
    context: proj.context && typeof proj.context === 'object' ? proj.context : {},
    evidencePack: proj.evidencePack || null,
  };
}

module.exports = {
  fromLegacyG4Input,
  toLegacyG4SemanticInput,
};
