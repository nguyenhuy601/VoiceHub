/**
 * Gate2 / plan materialize — approve only when planManifest artifact revisions match current tips.
 * Legacy packs without revision ids pass (backward compatible).
 * Mirrors ai-project-planning-service planningRevision/planManifest.assertManifestMatchesCurrent.
 */

function getCurrentRevisionId(container, kind) {
  const fromMap = container?.planning?.currentRevisionIds?.[kind];
  if (fromMap) return String(fromMap);
  const list = container?.planning?.revisions?.[kind];
  if (!Array.isArray(list) || !list.length) return null;
  const current = [...list].reverse().find((r) => r && r.status === 'current');
  return current?.revisionId || list[list.length - 1]?.revisionId || null;
}

/**
 * @param {object} container — pack.aiAnalysis
 * @param {object|null} manifest
 */
function assertManifestMatchesCurrent(container, manifest) {
  const mismatches = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: true, mismatches, legacy: true };
  }
  const arts = manifest.artifacts || {};
  for (const kind of ['wbs', 'dependency', 'risk', 'quality', 'schedule']) {
    const expected = arts[kind] ? String(arts[kind]) : '';
    if (!expected) continue;
    const current = getCurrentRevisionId(container, kind);
    if (current && current !== expected) {
      mismatches.push({ kind, expected, current });
    }
  }
  const baseline = manifest.wbsBaselineRevisionId
    ? String(manifest.wbsBaselineRevisionId)
    : '';
  if (baseline) {
    const pinned = container?.planning?.wbsBaselineRevisionId
      ? String(container.planning.wbsBaselineRevisionId)
      : '';
    if (pinned && pinned !== baseline) {
      mismatches.push({ kind: 'wbsBaseline', expected: baseline, current: pinned });
    }
  }
  return { ok: mismatches.length === 0, mismatches, legacy: false };
}

/**
 * Throw 409 when manifest present and mismatched.
 * @param {object} packOrContainer
 */
function assertGate2PlanManifestOrThrow(packOrContainer) {
  const container =
    packOrContainer?.aiAnalysis && typeof packOrContainer.aiAnalysis === 'object'
      ? packOrContainer.aiAnalysis
      : packOrContainer;
  const manifest =
    container?.planManifest ||
    container?.phaseRuns?.phase_how?.planManifest ||
    container?.completeness?.planManifest ||
    null;
  const check = assertManifestMatchesCurrent(container, manifest);
  if (!check.ok) {
    const err = new Error(
      'Plan manifest revisions do not match current artifacts — re-validate before approve'
    );
    err.statusCode = 409;
    err.errorCode = 'PLAN_MANIFEST_REVISION_MISMATCH';
    err.mismatches = check.mismatches;
    throw err;
  }
  return check;
}

module.exports = {
  getCurrentRevisionId,
  assertManifestMatchesCurrent,
  assertGate2PlanManifestOrThrow,
};
