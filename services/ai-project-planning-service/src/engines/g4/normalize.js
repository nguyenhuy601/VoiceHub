/**
 * G4.1 — Normalize FR list from snapshot (deterministic).
 */

const { listFrs } = require('../../tools/requirementAnalysis');

function normalizeFr(fr, index) {
  const id = String(fr?.externalId || fr?.id || fr?._id || `FR-${index + 1}`).trim();
  return {
    id,
    title: fr?.title || fr?.name || null,
    description: String(fr?.description || fr?.desc || '').trim(),
    ac: String(fr?.ac || fr?.acceptanceCriteria || '').trim(),
    priority: fr?.priority || null,
    module: fr?.module || fr?.moduleName || fr?.moduleLabel || null,
    feature: fr?.feature || fr?.featureName || fr?.featureLabel || null,
    level: fr?.level || 'Requirement',
    parentId: fr?.parentId || fr?.parentExternalId || null,
    dependency: fr?.dependency || fr?.dependsOn || fr?.dependencies || null,
    actorsRaw: fr?.actors || fr?.actor || null,
  };
}

function normalizeSnapshotFrs(snapshot = {}, opts = {}) {
  const maxFr = opts.maxFr != null ? Number(opts.maxFr) : 200;
  const frs = listFrs(snapshot).slice(0, Number.isFinite(maxFr) ? maxFr : 200);
  const seen = new Set();
  const normalized = [];
  const duplicates = [];
  for (let i = 0; i < frs.length; i += 1) {
    const row = normalizeFr(frs[i], i);
    if (seen.has(row.id)) {
      duplicates.push(row.id);
      continue;
    }
    seen.add(row.id);
    normalized.push(row);
  }
  return { functionalRequirements: normalized, duplicates };
}

module.exports = {
  normalizeFr,
  normalizeSnapshotFrs,
};
