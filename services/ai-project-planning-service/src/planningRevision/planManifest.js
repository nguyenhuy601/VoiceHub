/**
 * Plan manifest — Gate2 / plan materialize must approve & materialize a concrete revision set.
 */

const { newRevisionId } = require('./revisionIds');
const { getCurrentRevisionId } = require('./artifactRevision');

/**
 * Enrich finalizePlan-style manifest with current artifact revision ids.
 * @param {object} baseManifest — from finalizePlanNode
 * @param {object} container
 * @param {{ validationRunId?: string|null }} [opts]
 */
function enrichPlanManifestWithRevisions(baseManifest, container, opts = {}) {
  const base = baseManifest && typeof baseManifest === 'object' ? { ...baseManifest } : {};
  const planRevisionId = base.planRevisionId || newRevisionId('plan');
  const artifacts = {
    wbs: getCurrentRevisionId(container, 'wbs'),
    dependency: getCurrentRevisionId(container, 'dependency'),
    risk: getCurrentRevisionId(container, 'risk'),
    quality: getCurrentRevisionId(container, 'quality'),
    schedule: getCurrentRevisionId(container, 'schedule'),
  };
  return {
    ...base,
    planRevisionId,
    artifacts,
    validationRunId: opts.validationRunId || base.validationRunId || null,
    wbsBaselineRevisionId:
      container?.planning?.wbsBaselineRevisionId || artifacts.wbs || null,
  };
}

/**
 * Build approval record bound to a manifest (internal process baseline).
 * @param {object} opts
 */
function buildApprovalRecord(opts = {}) {
  return Object.freeze({
    approvalId: opts.approvalId || newRevisionId('appr'),
    scope: opts.scope || 'gate2_plan',
    planRevisionId: opts.planRevisionId || null,
    manifest: opts.manifest || null,
    actorUserId: opts.actorUserId || null,
    role: opts.role || null,
    approvedAt: opts.approvedAt || new Date().toISOString(),
    note: String(opts.note || '').slice(0, 2000),
  });
}

/**
 * Ensure approve target matches current tip revisions when present.
 * Missing revision fields = legacy pack → pass (backward compatible).
 * @param {object} container
 * @param {object|null} manifest
 * @returns {{ ok: boolean, mismatches: Array<{ kind: string, expected: string|null, current: string|null }> }}
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
      mismatches.push({
        kind: 'wbsBaseline',
        expected: baseline,
        current: pinned,
      });
    }
  }
  return { ok: mismatches.length === 0, mismatches, legacy: false };
}

/**
 * In-flight tool result must not overwrite a newer current tip.
 * @param {string|null} resultInputRevisionId
 * @param {string|null} currentRevisionId
 */
function shouldApplyToolResultToCurrent(resultInputRevisionId, currentRevisionId) {
  const input = String(resultInputRevisionId || '').trim();
  const current = String(currentRevisionId || '').trim();
  if (!input || !current) return true;
  return input === current;
}

module.exports = {
  enrichPlanManifestWithRevisions,
  buildApprovalRecord,
  assertManifestMatchesCurrent,
  shouldApplyToolResultToCurrent,
};
