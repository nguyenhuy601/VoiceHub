const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasPermission,
  unionPermissionsFromRoles,
  applyInformationLevelToPermissions,
  permissionsToBoardCapabilities,
  defaultPermissionsForRoleKey,
} = require('../src/utils/projectPermissionMatrix');

describe('projectAccess helpers', () => {
  it('union empty roles → empty', () => {
    assert.deepEqual(unionPermissionsFromRoles([]), []);
  });

  it('falls back to default when permissions array empty on role doc', () => {
    const union = unionPermissionsFromRoles([{ key: 'developer', permissions: [] }]);
    assert.ok(union.includes('task:create'));
  });

  it('capabilities expose permissions list for FE Hub', () => {
    const caps = permissionsToBoardCapabilities(defaultPermissionsForRoleKey('qa'));
    assert.ok(Array.isArray(caps.permissions));
    assert.equal(typeof caps.canManageMembers, 'boolean');
    assert.equal(typeof caps.canViewMembers, 'boolean');
    assert.equal(hasPermission(caps.permissions, 'task:update'), true);
  });

  it('summary ∩ matrix blocks task:create even if role has it', () => {
    const gated = applyInformationLevelToPermissions(
      defaultPermissionsForRoleKey('developer'),
      'summary'
    );
    assert.equal(hasPermission(gated, 'task:create'), false);
  });
});
