/**
 * Snapshot reuse gate — Data Lineage P0 (RULE-DL-05).
 * Reuse iff packContentHash ∧ pipelineVersion ∧ required projected.srs sections.
 */

const { PIPELINE_VERSION } = require('./pipelineConstants');
const { hasRequiredProjectedSrsSections } = require('./projectAnalysisSections');

/**
 * @param {object|null|undefined} snapshot — lean snapshot doc
 * @param {{ packContentHash?: string, pipelineVersion?: number }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
function isSnapshotProjectionCompatible(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, reason: 'missing_snapshot' };
  }

  const expectedHash = opts.packContentHash != null ? String(opts.packContentHash) : null;
  if (expectedHash != null && expectedHash !== '') {
    const snapHash = String(snapshot.packContentHash || '');
    if (snapHash !== expectedHash) {
      return { ok: false, reason: 'hash' };
    }
  }

  const expectedPipeline =
    opts.pipelineVersion != null ? Number(opts.pipelineVersion) : PIPELINE_VERSION;
  const snapPipeline = Number(snapshot.pipelineVersion);
  if (!Number.isFinite(snapPipeline) || snapPipeline !== expectedPipeline) {
    return { ok: false, reason: 'pipeline' };
  }

  const srs = snapshot.projected?.srs;
  if (!hasRequiredProjectedSrsSections(srs)) {
    return { ok: false, reason: 'sections' };
  }

  return { ok: true };
}

module.exports = {
  isSnapshotProjectionCompatible,
  CURRENT_SNAPSHOT_PIPELINE_VERSION: PIPELINE_VERSION,
};
