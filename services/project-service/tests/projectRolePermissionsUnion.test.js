/**
 * Admin Project Role permissions must feed hub Settings UI (union), not matrix-only.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  matrixPermissionsFromRoleKeys,
  unionPermissionsFromRoles,
  hasPermission,
  permissionsToBoardCapabilities,
} = require('../src/utils/project/projectPermissionMatrix');

describe('project role permissions — Admin settings:update', () => {
  const baRole = {
    key: 'business_analyst',
    permissions: ['settings:view', 'settings:update'],
  };

  it('matrixPermissionsFromRoleKeys ignores Admin doc permissions', () => {
    const matrix = matrixPermissionsFromRoleKeys([baRole]);
    assert.equal(hasPermission(matrix, 'settings:update'), false);
  });

  it('unionPermissionsFromRoles includes Admin settings:update', () => {
    const union = unionPermissionsFromRoles([baRole]);
    assert.equal(hasPermission(union, 'settings:view'), true);
    assert.equal(hasPermission(union, 'settings:update'), true);
  });

  it('board capabilities canUpdateSettings follows union (Admin)', () => {
    const caps = permissionsToBoardCapabilities(unionPermissionsFromRoles([baRole]));
    assert.equal(caps.canUpdateSettings, true);
    const matrixCaps = permissionsToBoardCapabilities(matrixPermissionsFromRoleKeys([baRole]));
    assert.equal(matrixCaps.canUpdateSettings, false);
  });

  it('PM matrix still grants settings via project:edit', () => {
    const pm = { key: 'project_manager', permissions: [] };
    const union = unionPermissionsFromRoles([pm]);
    const caps = permissionsToBoardCapabilities(union);
    assert.equal(hasPermission(union, 'project:edit'), true);
    assert.equal(caps.canUpdateSettings, true);
  });
});
