/**
 * Data Lineage P0 — hydrate bind packId.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  hydrateAnalysisSnapshotForPlanning,
} = require('../src/services/aiPlanningSnapshotHydrate.service');

describe('hydrateAnalysisSnapshotForPlanning', () => {
  it('rejects packId mismatch with 409', async () => {
    const AiAnalysisSnapshot = require('../src/models/AiAnalysisSnapshot');
    const original = AiAnalysisSnapshot.findOne;
    AiAnalysisSnapshot.findOne = () => ({
      lean: async () => ({
        _id: 'snap1',
        packId: 'pack-A',
        organizationId: 'org1',
        packContentHash: 'h',
        pipelineVersion: 3,
        projected: { srs: { functionalRequirements: [] }, employees: [] },
      }),
    });
    try {
      await hydrateAnalysisSnapshotForPlanning({
        snapshotId: 'snap1',
        packId: 'pack-B',
        organizationId: 'org1',
      });
      assert.fail('expected mismatch error');
    } catch (err) {
      assert.equal(err.statusCode, 409);
      assert.equal(err.errorCode, 'SNAPSHOT_PACK_MISMATCH');
    } finally {
      AiAnalysisSnapshot.findOne = original;
    }
  });

  it('requires snapshotId packId organizationId', async () => {
    try {
      await hydrateAnalysisSnapshotForPlanning({
        snapshotId: '',
        packId: 'p',
        organizationId: 'o',
      });
      assert.fail('expected validation error');
    } catch (err) {
      assert.equal(err.statusCode, 400);
      assert.equal(err.errorCode, 'HYDRATE_PARAMS_REQUIRED');
    }
  });
});
