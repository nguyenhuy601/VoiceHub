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

  // RULE-SC: Customer Raw intake on this pipeline must carry canonicalRaw
  const intakeKind = String(
    snapshot.ingestionValidation?.intakeKind || ''
  ).toLowerCase();
  const isCustomerRawIntake =
    intakeKind === 'customer_raw' || intakeKind === 'customerraw';
  if (isCustomerRawIntake && expectedPipeline >= 4) {
    const cr = snapshot.canonicalRaw;
    if (!cr || typeof cr !== 'object' || !cr.registryVersion) {
      return { ok: false, reason: 'canonical_raw' };
    }
  }

  return { ok: true };
}

module.exports = {
  isSnapshotProjectionCompatible,
  CURRENT_SNAPSHOT_PIPELINE_VERSION: PIPELINE_VERSION,
};
