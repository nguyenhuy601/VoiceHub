const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertCanSoftDeleteRequirementPack } = require('../src/utils/requirementPackDelete');

describe('assertCanSoftDeleteRequirementPack', () => {
  it('allows approved pack without projectId', () => {
    const result = assertCanSoftDeleteRequirementPack({
      status: 'approved',
      isActive: true,
      projectId: null,
    });
    assert.equal(result.ok, true);
  });

  it('rejects missing or inactive pack', () => {
    assert.equal(assertCanSoftDeleteRequirementPack(null).errorCode, 'REQ_PACK_NOT_FOUND');
    assert.equal(
      assertCanSoftDeleteRequirementPack({ status: 'approved', isActive: false }).statusCode,
      404
    );
  });

  it('rejects non-approved statuses', () => {
    for (const status of ['draft', 'under_review', 'rejected', 'project_linked']) {
      const result = assertCanSoftDeleteRequirementPack({ status, isActive: true });
      assert.equal(result.ok, false);
      assert.equal(result.errorCode, 'REQ_PACK_DELETE_FORBIDDEN');
      assert.equal(result.statusCode, 409);
    }
  });

  it('rejects approved pack with projectId', () => {
    const result = assertCanSoftDeleteRequirementPack({
      status: 'approved',
      isActive: true,
      projectId: '507f1f77bcf86cd799439011',
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'REQ_PACK_ALREADY_LINKED');
  });
});
