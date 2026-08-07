const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROJECT_PERMISSION_KEYS,
  defaultPermissionsForRoleKey,
  normalizePermissionList,
  unionPermissionsFromRoles,
  hasPermission,
  permissionsToBoardCapabilities,
  applyInformationLevelToPermissions,
  assertPermission,
} = require('../src/utils/projectPermissionMatrix');

describe('projectPermissionMatrix', () => {
  it('T1: default matrix seed has known keys for developer/pm/watcher', () => {
    const pm = defaultPermissionsForRoleKey('project_manager');
    const dev = defaultPermissionsForRoleKey('developer');
    const watcher = defaultPermissionsForRoleKey('watcher');
    assert.ok(pm.includes('project:delete'));
    assert.ok(dev.includes('task:update'));
    assert.equal(dev.includes('sprint:close'), false);
    assert.ok(watcher.includes('task:view'));
    assert.equal(watcher.includes('task:create'), false);
    assert.ok(PROJECT_PERMISSION_KEYS.includes('members:manage'));
  });

  it('T2: developer has update task but not delete sprint', () => {
    const caps = permissionsToBoardCapabilities(defaultPermissionsForRoleKey('developer'));
    assert.equal(caps.canEditCards, true);
    assert.equal(caps.canCreateCards, true);
    assert.equal(hasPermission(defaultPermissionsForRoleKey('developer'), 'sprint:close'), false);
  });

  it('T3: watcher cannot mutate', () => {
    const w = defaultPermissionsForRoleKey('watcher');
    assert.equal(hasPermission(w, 'task:update'), false);
    assert.equal(hasPermission(w, 'task:create'), false);
    assert.throws(() => assertPermission(w, 'task:delete'), /403|task:delete|Thiếu quyền/);
  });

  it('T4: multi-role union permissions', () => {
    const union = unionPermissionsFromRoles([
      { key: 'watcher', permissions: defaultPermissionsForRoleKey('watcher') },
      { key: 'developer', permissions: defaultPermissionsForRoleKey('developer') },
    ]);
    assert.ok(union.includes('task:create'));
    assert.ok(union.includes('project:view'));
  });

  it('T5: summary strips task actions', () => {
    const full = defaultPermissionsForRoleKey('developer');
    const gated = applyInformationLevelToPermissions(full, 'summary');
    assert.equal(gated.includes('task:view'), false);
    assert.ok(gated.includes('project:view'));
  });

  it('T6: org admin bypass via capabilities adapter', () => {
    const caps = permissionsToBoardCapabilities([], { isOrgAdmin: true });
    assert.equal(caps.canManageBoard, true);
    assert.equal(caps.canCreateCards, true);
    assert.ok(caps.permissions.length > 10);
  });

  it('T7: legacy developer/watcher alias to master keys', () => {
    const dev = defaultPermissionsForRoleKey('developer');
    const backend = defaultPermissionsForRoleKey('backend_developer');
    assert.deepEqual(dev, backend);
    const watcher = defaultPermissionsForRoleKey('watcher');
    const observer = defaultPermissionsForRoleKey('observer');
    assert.deepEqual(watcher, observer);
  });

  it('normalize drops unknown keys', () => {
    const n = normalizePermissionList(['task:view', 'hack:root', 'TASK:CREATE']);
    assert.deepEqual(n, ['task:view', 'task:create']);
  });
});
