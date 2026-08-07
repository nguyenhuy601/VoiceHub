const test = require('node:test');
const assert = require('node:assert/strict');

const permissionService = require('../src/services/permission.service');
const {
  materializeLegacyPermissions,
  resolveMasterKeysForLegacyAction,
} = require('../src/config/rbacV2Catalog');

test('T4/T6 hasPermission — legacy Role.permissions shape', () => {
  const permissions = materializeLegacyPermissions([
    'project.task.view',
    'project.task.create',
    'system.permission_group.clone',
  ]);

  assert.equal(permissionService.hasPermission(permissions, 'task:read'), true);
  assert.equal(permissionService.hasPermission(permissions, 'task:write'), true);
  assert.equal(permissionService.hasPermission(permissions, 'role:write'), true);
  assert.equal(permissionService.hasPermission(permissions, 'voice:write'), false);
});

test('T6 master action key via hasPermission after materialize', () => {
  const permissions = materializeLegacyPermissions(['meeting.meeting.create']);
  assert.equal(permissionService.hasPermission(permissions, 'meeting.meeting.create'), true);
  assert.equal(permissionService.hasPermission(permissions, 'voice:write'), true);
});

test('legacy adapter covers System/Organization/Project axes', () => {
  assert.ok(resolveMasterKeysForLegacyAction('role:read').length);
  assert.ok(resolveMasterKeysForLegacyAction('organization:write').length);
  assert.ok(resolveMasterKeysForLegacyAction('task:delete').length);
});
