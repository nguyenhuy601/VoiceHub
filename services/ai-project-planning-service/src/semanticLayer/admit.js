/**
 * Scope, snapshot pin, and review admission. Runs before any text is packed.
 */

const APPROVED = new Set(['APPROVED', 'CONFIRMED']);
const USABLE = new Set(['APPROVED', 'CONFIRMED', 'RUN']);

function versionAllowed(item, snapshot) {
  const pinned = snapshot?.pinnedVersions?.[item.entityId];
  if (pinned) return item.versionId === pinned;
  return item.lifecycleStatus !== 'SUPERSEDED';
}

function admitsScope(item, bound) {
  if (item.organizationId && item.organizationId !== bound.organizationId) return false;
  if (item.scope === 'system') return true;
  if (item.scope === 'organization') return item.organizationId === bound.organizationId;
  if (item.scope === 'historical_evidence') {
    if (bound.historicalEvidencePolicy === 'NONE') return false;
    if (bound.historicalEvidencePolicy === 'SAME_PROJECT') {
      return item.projectId === bound.projectId;
    }
    return item.organizationId === bound.organizationId;
  }
  if (item.scope === 'run') return item.projectId === bound.projectId;
  return item.projectId === bound.projectId;
}

function splitByAdmission(items, bound, snapshot) {
  const kept = [];
  const proposals = [];
  const rejected = [];
  for (const item of items || []) {
    if (!versionAllowed(item, snapshot)) {
      rejected.push({ id: item.id, code: 'VERSION' });
      continue;
    }
    if (!admitsScope(item, bound)) {
      rejected.push({ id: item.id, code: 'SCOPE' });
      continue;
    }
    if (!USABLE.has(item.reviewStatus)) {
      if (item.reviewStatus === 'PENDING') proposals.push(item);
      rejected.push({ id: item.id, code: 'REVIEW' });
      continue;
    }
    kept.push(item);
  }
  return { kept, proposals, rejected };
}

module.exports = {
  versionAllowed,
  admitsScope,
  splitByAdmission,
};
