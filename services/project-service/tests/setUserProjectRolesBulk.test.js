/**
 * Unit — bulk member roles normalize + aggregate (pure, no DB).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BULK_MEMBER_ROLES_MAX,
  normalizeBulkMemberUserIds,
  aggregateBulkMemberRoleResults,
} = require('../src/utils/project/memberRolesBulk');

const VALID = '507f1f77bcf86cd799439011';
const VALID2 = '507f1f77bcf86cd799439012';
const VALID3 = '507f1f77bcf86cd799439013';
const isValidId = (id) => /^[a-f0-9]{24}$/i.test(id);

describe('normalizeBulkMemberUserIds', () => {
  it('dedupes and returns unique ids', () => {
    const ids = normalizeBulkMemberUserIds([VALID, VALID, VALID2], { isValidId });
    assert.deepEqual(ids, [VALID, VALID2]);
  });

  it('rejects non-array', () => {
    assert.throws(
      () => normalizeBulkMemberUserIds('x', { isValidId }),
      (err) => err.statusCode === 400 && err.errorCode === 'PROJECT_MEMBER_ROLES_BULK_INVALID'
    );
  });

  it('rejects empty', () => {
    assert.throws(
      () => normalizeBulkMemberUserIds([], { isValidId }),
      (err) => err.statusCode === 400 && err.errorCode === 'PROJECT_MEMBER_ROLES_BULK_EMPTY'
    );
  });

  it('rejects over cap', () => {
    const many = Array.from({ length: BULK_MEMBER_ROLES_MAX + 1 }, (_, i) =>
      i.toString(16).padStart(24, '0')
    );
    assert.throws(
      () => normalizeBulkMemberUserIds(many, { isValidId }),
      (err) => err.statusCode === 400 && err.errorCode === 'PROJECT_MEMBER_ROLES_BULK_TOO_MANY'
    );
  });

  it('rejects invalid id', () => {
    assert.throws(
      () => normalizeBulkMemberUserIds(['not-an-oid'], { isValidId }),
      (err) => err.statusCode === 400 && err.errorCode === 'PROJECT_MEMBER_ROLES_BULK_INVALID_ID'
    );
  });
});

describe('aggregateBulkMemberRoleResults', () => {
  it('counts ok fail overallocated; partial success preserved', () => {
    const agg = aggregateBulkMemberRoleResults([
      { userId: VALID, ok: true, allocationStatus: 'ok' },
      { userId: VALID2, ok: true, allocationStatus: 'overallocated' },
      { userId: VALID3, ok: false, errorCode: 'PROJECT_MEMBER_ROLES_FAILED' },
    ]);
    assert.equal(agg.ok, 2);
    assert.equal(agg.fail, 1);
    assert.equal(agg.overallocated, 1);
    assert.equal(agg.results.length, 3);
    assert.equal(agg.results[2].errorCode, 'PROJECT_MEMBER_ROLES_FAILED');
  });

  it('handles empty', () => {
    const agg = aggregateBulkMemberRoleResults([]);
    assert.deepEqual(agg, { ok: 0, fail: 0, overallocated: 0, results: [] });
  });
});
