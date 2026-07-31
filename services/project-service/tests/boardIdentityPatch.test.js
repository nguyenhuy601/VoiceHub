const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBoardIdentityPatch,
  BOARD_IDENTITY_PATCH_KEYS,
} = require('../src/utils/boardIdentityPatch');

describe('buildBoardIdentityPatch', () => {
  it('T1: patches title and visibility; ignores unknown fields', () => {
    const built = buildBoardIdentityPatch({
      title: '  Backend Hub  ',
      visibility: 'workspace',
      evil: 'drop-me',
      workflowId: 'should-ignore',
    });
    assert.equal(built.ok, true);
    assert.equal(built.$set.title, 'Backend Hub');
    assert.equal(built.$set.visibility, 'workspace');
    assert.equal(built.$set.evil, undefined);
    assert.equal(built.$set.workflowId, undefined);
    assert.ok(BOARD_IDENTITY_PATCH_KEYS.includes('title'));
  });

  it('rejects empty title', () => {
    const built = buildBoardIdentityPatch({ title: '   ' });
    assert.equal(built.ok, false);
  });

  it('clears dueDate with null', () => {
    const built = buildBoardIdentityPatch({ dueDate: null });
    assert.equal(built.ok, true);
    assert.equal(built.$set.dueDate, null);
  });

  it('maps team scope from teamId', () => {
    const built = buildBoardIdentityPatch({
      scopeType: 'team',
      teamId: '64a1b2c3d4e5f67890123456',
    });
    assert.equal(built.ok, true);
    assert.equal(built.$set.scopeType, 'team');
    assert.equal(built.$set.scopeId, '64a1b2c3d4e5f67890123456');
    assert.equal(built.$set.teamId, '64a1b2c3d4e5f67890123456');
  });

  it('maps organization scope from organizationId', () => {
    const built = buildBoardIdentityPatch({
      scopeType: 'organization',
      organizationId: '64a1b2c3d4e5f67890123456',
    });
    assert.equal(built.ok, true);
    assert.equal(built.$set.scopeType, 'organization');
    assert.equal(built.$set.scopeId, '64a1b2c3d4e5f67890123456');
    assert.equal(built.$set.teamId, null);
  });
});
