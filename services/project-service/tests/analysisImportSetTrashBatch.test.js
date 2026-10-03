const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DELETED_REASON_SET_CASCADE,
  buildDeletedBatchId,
  parseBatchTimestampMs,
  buildMemberRestoreFilter,
} = require('../src/utils/analysis/importSetTrashBatch');

describe('analysisImportSetTrashBatch', () => {
  it('builds stable batch id from setId and timestamp', () => {
    const id = buildDeletedBatchId('507f1f77bcf86cd799439011', 1700000000000);
    assert.equal(id, '507f1f77bcf86cd799439011:1700000000000');
    assert.equal(parseBatchTimestampMs(id), 1700000000000);
  });

  it('restore filter scopes to cascade batch only', () => {
    const batch = 'setA:123';
    const filter = buildMemberRestoreFilter('setA', batch);
    assert.equal(filter.importSetId, 'setA');
    assert.equal(filter.deletedReason, DELETED_REASON_SET_CASCADE);
    assert.equal(filter.deletedBatchId, batch);
  });

  it('legacy restore filter without batch id', () => {
    const filter = buildMemberRestoreFilter('setB', null);
    assert.deepEqual(filter.deletedBatchId, { $in: [null, ''] });
  });
});
