/**
 * Scope isolation for RAG — tenant / project / snapshot (Wave 1).
 * Apply before selecting hits (keyword, vector, required bind, cache).
 */

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {object|null|undefined} snapshot
 * @param {object} [opts]
 * @returns {{ tenantId: string|null, projectId: string|null, snapshotId: string|null }}
 */
function resolveScopeFromSnapshot(snapshot, opts = {}) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const snapshotId = trimStr(
    opts.snapshotId || snap.snapshotId || snap.id || ''
  ) || null;
  const projectId = trimStr(
    opts.projectId ||
      snap.projectId ||
      snap.projectRef ||
      snap.projected?.projectId ||
      ''
  ) || null;
  const tenantId = trimStr(
    opts.tenantId ||
      snap.tenantId ||
      snap.orgId ||
      snap.organizationId ||
      snap.projected?.tenantId ||
      ''
  ) || null;
  return { tenantId, projectId, snapshotId };
}

/**
 * Doc/citation matches run scope. Missing scope fields on doc are allowed when
 * the corresponding scope side is null; mismatch rejects.
 * @param {object} doc
 * @param {{ tenantId?: string|null, projectId?: string|null, snapshotId?: string|null }} scope
 */
function matchesScope(doc, scope = {}) {
  if (!doc || typeof doc !== 'object') return false;
  const meta = doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {};
  const docSnap = trimStr(meta.snapshotId || doc.snapshotId || '');
  const docProj = trimStr(meta.projectId || doc.projectId || '');
  const docTenant = trimStr(meta.tenantId || doc.tenantId || '');

  const wantSnap = trimStr(scope.snapshotId || '');
  const wantProj = trimStr(scope.projectId || '');
  const wantTenant = trimStr(scope.tenantId || '');

  if (wantSnap && docSnap && docSnap !== wantSnap) return false;
  if (wantProj && docProj && docProj !== wantProj) return false;
  if (wantTenant && docTenant && docTenant !== wantTenant) return false;
  // Require snapshot bind when scope asks for it and doc has no snapshotId
  if (wantSnap && !docSnap) return false;
  return true;
}

/**
 * @param {object[]} docs
 * @param {object} scope
 */
function filterDocsByScope(docs, scope) {
  return (Array.isArray(docs) ? docs : []).filter((d) => matchesScope(d, scope));
}

/**
 * Stable cache key — prevents cross-scope hit reuse.
 * @param {{ tenantId?: string|null, projectId?: string|null, snapshotId?: string|null, query?: string, mode?: string, taskPurpose?: string }} parts
 */
function buildRetrieveCacheKey(parts = {}) {
  return [
    'rag',
    trimStr(parts.tenantId) || '-',
    trimStr(parts.projectId) || '-',
    trimStr(parts.snapshotId) || '-',
    trimStr(parts.mode) || '-',
    trimStr(parts.taskPurpose) || '-',
    trimStr(parts.query).slice(0, 200),
  ].join('|');
}

/**
 * Qdrant must-clauses for payload filter (additive on top of snapshotId).
 * @param {{ tenantId?: string|null, projectId?: string|null, snapshotId?: string|null }} scope
 */
function buildQdrantMustFilters(scope = {}) {
  const must = [];
  const snapshotId = trimStr(scope.snapshotId || '');
  if (snapshotId) {
    must.push({ key: 'snapshotId', match: { value: snapshotId } });
  }
  const projectId = trimStr(scope.projectId || '');
  if (projectId) {
    must.push({ key: 'projectId', match: { value: projectId } });
  }
  const tenantId = trimStr(scope.tenantId || '');
  if (tenantId) {
    must.push({ key: 'tenantId', match: { value: tenantId } });
  }
  return must;
}

module.exports = {
  resolveScopeFromSnapshot,
  matchesScope,
  filterDocsByScope,
  buildRetrieveCacheKey,
  buildQdrantMustFilters,
};
