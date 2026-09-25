/**
 * RULE-20 — fork PlanningArtifact version mới sau baseline (change control).
 * Pure helpers + service uses create path.
 */

function nextArtifactVersion(currentVersion) {
  const n = Number(currentVersion);
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.floor(n) + 1;
}

/**
 * Build draft payload for forked version from an approved artifact lean doc.
 * @param {object} source
 * @param {string|object} userId
 */
function buildForkDraftFromArtifact(source, userId) {
  if (!source || !source.kind || !source.externalKey) {
    const err = new Error('Artifact nguồn không hợp lệ để fork');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_FORK_INVALID';
    throw err;
  }
  const status = String(source.status || '').toLowerCase();
  if (status !== 'approved') {
    const err = new Error('Chỉ fork được artifact đã approved (change control sau baseline)');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_FORK_NOT_APPROVED';
    throw err;
  }
  return {
    kind: source.kind,
    externalKey: source.externalKey,
    title: source.title,
    summary: source.summary || '',
    body: source.body || '',
    structured:
      source.structured && typeof source.structured === 'object' ? { ...source.structured } : {},
    parentExternalKey: source.parentExternalKey || '',
    version: nextArtifactVersion(source.version),
    source: 'manual',
    forkedFromArtifactId: String(source._id || source.id || ''),
    forkedFromVersion: source.version || 1,
    createdBy: userId,
  };
}

module.exports = {
  nextArtifactVersion,
  buildForkDraftFromArtifact,
};
