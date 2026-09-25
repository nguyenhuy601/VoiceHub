/**
 * Pure helpers for analysis artifact bulk transition id filtering.
 */

const mongoose = require('../../db');

/**
 * Normalize optional artifactIds from request body.
 * @returns {null|import('mongoose').Types.ObjectId[]} null = no id filter (legacy all-status)
 */
function normalizeBulkArtifactIds(artifactIds) {
  if (artifactIds == null) return null;
  const raw = Array.isArray(artifactIds) ? artifactIds : [artifactIds];
  const ids = [];
  const seen = new Set();
  for (const value of raw) {
    const s = String(value || '').trim();
    if (!s || !mongoose.isValidObjectId(s) || seen.has(s)) continue;
    seen.add(s);
    ids.push(new mongoose.Types.ObjectId(s));
    if (ids.length >= 500) break;
  }
  return ids;
}

/**
 * Build Mongo filter for bulk transition.
 * @param {{
 *   projectId: string,
 *   fromStatus: string,
 *   artifactIds?: unknown,
 *   excludeCreatedBy?: string|null,
 * }} args
 */
function buildBulkTransitionFilter({
  projectId,
  fromStatus,
  artifactIds,
  excludeCreatedBy = null,
}) {
  const filter = {
    projectId,
    isActive: true,
    status: String(fromStatus || '')
      .trim()
      .toLowerCase(),
  };
  const ids = normalizeBulkArtifactIds(artifactIds);
  if (ids) {
    filter._id = { $in: ids };
  }
  if (excludeCreatedBy) {
    filter.createdBy = { $ne: excludeCreatedBy };
  }
  return { filter, idFilterActive: Boolean(ids), requestedIds: ids };
}

module.exports = {
  normalizeBulkArtifactIds,
  buildBulkTransitionFilter,
};
