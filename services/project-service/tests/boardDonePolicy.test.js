const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DEV_PERMS,
  QA_PERMS,
  PM_PERMS,
  defaultPermissionsForRoleKey,
  permissionsToBoardCapabilities,
} = require('../src/utils/project/projectPermissionMatrix');
const { isReadyForQaListTitle } = require('../src/services/boardCapabilities');

describe('board Done policy', () => {
  it('does not allow developers to move cards to Done', () => {
    assert.equal(permissionsToBoardCapabilities(DEV_PERMS).canMoveToDone, false);
  });

  it('allows QA to move cards to Done', () => {
    assert.equal(permissionsToBoardCapabilities(QA_PERMS).canMoveToDone, true);
  });

  it('allows PM and technical lead to move cards to Done', () => {
    assert.equal(permissionsToBoardCapabilities(PM_PERMS).canMoveToDone, true);
    assert.equal(
      permissionsToBoardCapabilities(
        defaultPermissionsForRoleKey('technical_lead')
      ).canMoveToDone,
      true
    );
  });

  it('recognizes the Ready for QA list title', () => {
    assert.equal(isReadyForQaListTitle('Ready for QA'), true);
  });
});
