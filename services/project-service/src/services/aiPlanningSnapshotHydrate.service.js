/**
 * Internal S2S hydrate — snapshot + analysis-freeze pack (Data Lineage P0).
 */

const AiAnalysisSnapshot = require('../models/AiAnalysisSnapshot');
const RequirementPack = require('../models/RequirementPack');
const { buildPackObjectFromSnapshot } = require('../utils/aiAnalysis/pipeline/buildPipeline');

/**
 * @param {{ snapshotId: string, packId: string, organizationId: string }} opts
 */
async function hydrateAnalysisSnapshotForPlanning({
  snapshotId,
  packId,
  organizationId,
}) {
  const sid = String(snapshotId || '').trim();
  const pid = String(packId || '').trim();
  const orgId = String(organizationId || '').trim();
  if (!sid || !pid || !orgId) {
    const err = new Error('snapshotId, packId, and organizationId are required');
    err.statusCode = 400;
    err.errorCode = 'HYDRATE_PARAMS_REQUIRED';
    throw err;
  }

  const snapshotDoc = await AiAnalysisSnapshot.findOne({
    _id: sid,
    organizationId: orgId,
  }).lean();
  if (!snapshotDoc) {
    const err = new Error('Analysis snapshot not found');
    err.statusCode = 404;
    err.errorCode = 'SNAPSHOT_NOT_FOUND';
    throw err;
  }

  if (String(snapshotDoc.packId) !== pid) {
    const err = new Error('snapshot.packId does not match requested packId');
    err.statusCode = 409;
    err.errorCode = 'SNAPSHOT_PACK_MISMATCH';
    throw err;
  }

  const packDoc = await RequirementPack.findOne({
    _id: pid,
    organizationId: orgId,
    isActive: true,
  }).lean();
  if (!packDoc) {
    const err = new Error('Requirement pack not found');
    err.statusCode = 404;
    err.errorCode = 'PACK_NOT_FOUND';
    throw err;
  }

  const pack = buildPackObjectFromSnapshot(packDoc, snapshotDoc, {});
  const snapshot = {
    ...snapshotDoc,
    snapshotId: String(snapshotDoc._id),
    id: String(snapshotDoc._id),
    packId: pid,
  };

  return {
    snapshotId: String(snapshotDoc._id),
    packId: pid,
    organizationId: orgId,
    packContentHash: snapshotDoc.packContentHash || null,
    pipelineVersion: snapshotDoc.pipelineVersion ?? null,
    snapshot,
    pack,
  };
}

module.exports = {
  hydrateAnalysisSnapshotForPlanning,
};
