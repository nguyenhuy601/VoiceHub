/**
 * Shared WHAT snapshot projection (no LLM) — used by legacy G4 and semantic pipeline.
 */

const { listFrs } = require('../tools/requirementAnalysis');

function projectWhatSnapshot(snapshot = {}) {
  const frs = listFrs(snapshot).slice(0, 200);
  return {
    snapshotId: snapshot.snapshotId || snapshot.id || null,
    packId: snapshot.packId || null,
    overview: {
      requirementName: snapshot.overview?.requirementName || snapshot.overview?.name || null,
      summary: snapshot.overview?.summary || snapshot.overview?.description || null,
    },
    functionalRequirements: frs.map((fr, i) => ({
      id: String(fr.id || fr._id || fr.externalId || `FR-${i + 1}`),
      title: fr.title || fr.name || null,
      description: String(fr.description || '').slice(0, 400),
      ac: String(fr.ac || fr.acceptanceCriteria || '').slice(0, 200),
      priority: fr.priority || null,
      module: fr.module || null,
      feature: fr.feature || null,
      parentId: fr.parentId || fr.parentExternalId || null,
      dependency: fr.dependency || fr.dependsOn || null,
      level: fr.level || 'Requirement',
    })),
  };
}

module.exports = {
  projectWhatSnapshot,
};
