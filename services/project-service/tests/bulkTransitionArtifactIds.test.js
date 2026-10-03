/**
 * bulkTransitionArtifactIds — id filter policy (no Mongo I/O).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  normalizeBulkArtifactIds,
  buildBulkTransitionFilter,
} = require('../src/utils/analysis/bulkTransitionArtifactIds');

describe('bulkTransitionArtifactIds', () => {
  it('normalizeBulkArtifactIds returns null when omitted (legacy all-status)', () => {
    assert.equal(normalizeBulkArtifactIds(null), null);
    assert.equal(normalizeBulkArtifactIds(undefined), null);
  });

  it('normalizeBulkArtifactIds keeps valid unique ObjectIds only', () => {
    const a = new mongoose.Types.ObjectId().toString();
    const b = new mongoose.Types.ObjectId().toString();
    const ids = normalizeBulkArtifactIds([a, a, 'not-an-id', b]);
    assert.equal(ids.length, 2);
    assert.equal(String(ids[0]), a);
    assert.equal(String(ids[1]), b);
  });

  it('buildBulkTransitionFilter applies id filter when artifactIds provided', () => {
    const a = new mongoose.Types.ObjectId().toString();
    const { filter, idFilterActive } = buildBulkTransitionFilter({
      projectId: 'proj1',
      fromStatus: 'draft',
      artifactIds: [a],
    });
    assert.equal(idFilterActive, true);
    assert.equal(filter.status, 'draft');
    assert.equal(filter._id.$in.length, 1);
  });

  it('buildBulkTransitionFilter without ids leaves legacy filter', () => {
    const { filter, idFilterActive } = buildBulkTransitionFilter({
      projectId: 'proj1',
      fromStatus: 'ba_review',
    });
    assert.equal(idFilterActive, false);
    assert.equal(filter._id, undefined);
    assert.equal(filter.status, 'ba_review');
  });

  it('four-eyes excludeCreatedBy merges into filter', () => {
    const a = new mongoose.Types.ObjectId().toString();
    const { filter } = buildBulkTransitionFilter({
      projectId: 'proj1',
      fromStatus: 'ba_review',
      artifactIds: [a],
      excludeCreatedBy: 'user1',
    });
    assert.deepEqual(filter.createdBy, { $ne: 'user1' });
    assert.ok(filter._id.$in.length === 1);
  });
});
