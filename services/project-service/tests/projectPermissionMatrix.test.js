const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROJECT_PERMISSION_KEYS,
  defaultPermissionsForRoleKey,
  normalizePermissionList,
  splitPermissionList,
  assertKnownPermissionList,
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
    assert.ok(pm.includes('project:edit'));
    assert.ok(pm.includes('delivery:manage'));
    assert.ok(pm.includes('report:view'));
    assert.equal(pm.includes('project:delete'), false);
    assert.equal(pm.includes('task:create'), false);
    assert.ok(dev.includes('task:update'));
    assert.ok(dev.includes('task:comment'));
    assert.ok(dev.includes('task:estimate'));
    assert.ok(dev.includes('bug:create'));
    assert.ok(dev.includes('approval:request'));
    assert.equal(dev.includes('sprint:close'), false);
    assert.equal(dev.includes('epic:create'), false);
    assert.ok(watcher.includes('task:view'));
    assert.ok(watcher.includes('backlog:view'));
    assert.ok(watcher.includes('delivery:view'));
    assert.ok(watcher.includes('report:view'));
    assert.equal(watcher.includes('task:create'), false);
    assert.ok(PROJECT_PERMISSION_KEYS.includes('members:manage'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('story:create'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('task:estimate'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('sprint:start'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('sprint:delete'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('change_request:view'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('change_request:create'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('change_request:update'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('change_request:delete'));
    assert.ok(watcher.includes('change_request:view'));
    assert.equal(watcher.includes('change_request:create'), false);
    assert.ok(pm.includes('change_request:delete'));
    assert.ok(dev.includes('change_request:create'));
    assert.equal(dev.includes('change_request:delete'), false);
  });

  it('T2: developer has update task but not delete sprint', () => {
    const caps = permissionsToBoardCapabilities(defaultPermissionsForRoleKey('developer'));
    assert.equal(caps.canEditCards, true);
    assert.equal(caps.canCreateCards, true);
    assert.equal(hasPermission(defaultPermissionsForRoleKey('developer'), 'sprint:close'), false);
    assert.equal(hasPermission(defaultPermissionsForRoleKey('developer'), 'sprint:delete'), false);
  });

  it('T3: watcher cannot mutate', () => {
    const w = defaultPermissionsForRoleKey('watcher');
    assert.equal(hasPermission(w, 'task:update'), false);
    assert.equal(hasPermission(w, 'task:create'), false);
    assert.equal(hasPermission(w, 'task:comment'), false);
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

  it('T8: SM can close sprint but not create story/task', () => {
    const sm = defaultPermissionsForRoleKey('scrum_master');
    assert.ok(sm.includes('sprint:close'));
    assert.ok(sm.includes('sprint:start'));
    assert.ok(sm.includes('sprint:create'));
    assert.ok(sm.includes('sprint:delete'));
    assert.ok(sm.includes('delivery:view'));
    assert.equal(sm.includes('story:create'), false);
    assert.equal(sm.includes('task:create'), false);
    assert.equal(sm.includes('epic:create'), false);
    assert.equal(sm.includes('project:delete'), false);
    assert.equal(sm.includes('members:manage'), false);
    assert.equal(sm.includes('approval:manage_policy'), false);
  });

  it('T9: PO manages epic/story/priority, not technical tasks', () => {
    const po = defaultPermissionsForRoleKey('product_owner');
    assert.ok(po.includes('backlog:update'));
    assert.ok(po.includes('backlog:prioritize'));
    assert.ok(po.includes('epic:create'));
    assert.ok(po.includes('story:create'));
    assert.ok(po.includes('approval:request'));
    assert.ok(po.includes('change_request:create'));
    assert.ok(po.includes('change_request:update'));
    assert.equal(po.includes('change_request:delete'), false);
    assert.equal(po.includes('task:create'), false);
    assert.equal(po.includes('bug:create'), false);
    assert.equal(po.includes('sprint:start'), false);
    assert.equal(po.includes('approval:decide'), false);
    assert.equal(po.includes('project:delete'), false);
    assert.equal(po.includes('repository:merge'), false);
    assert.equal(po.includes('approval:manage_policy'), false);
  });

  it('T10: members:view off → canViewMembers false; members:manage implies view', () => {
    const noMembers = permissionsToBoardCapabilities(['project:view', 'files:view', 'task:view']);
    assert.equal(noMembers.canViewMembers, false);
    assert.equal(noMembers.canManageMembers, false);
    const viewOnly = permissionsToBoardCapabilities(['project:view', 'members:view']);
    assert.equal(viewOnly.canViewMembers, true);
    assert.equal(viewOnly.canManageMembers, false);
    const manageOnly = permissionsToBoardCapabilities(['project:view', 'members:manage']);
    assert.equal(manageOnly.canViewMembers, true);
    assert.equal(manageOnly.canManageMembers, true);
  });

  it('T2-wire: comment denied without task:comment; decide denied without approval:decide', () => {
    const observer = defaultPermissionsForRoleKey('observer');
    assert.throws(() => assertPermission(observer, 'task:comment'), /task:comment|Thiếu quyền/);
    assert.throws(() => assertPermission(observer, 'approval:decide'), /approval:decide|Thiếu quyền/);
    const dev = defaultPermissionsForRoleKey('backend_developer');
    assertPermission(dev, 'task:comment');
    assert.equal(hasPermission(dev, 'approval:decide'), false);
    const tl = defaultPermissionsForRoleKey('technical_lead');
    assertPermission(tl, 'approval:decide');
    assertPermission(tl, 'task:delete');
    assert.equal(hasPermission(tl, 'delivery:manage'), false);
    assert.equal(hasPermission(tl, 'epic:create'), false);
    assert.equal(hasPermission(tl, 'approval:manage_policy'), false);
  });

  it('T11: Scrum bands — PO/BA epic+story; SM sprint; QA bug; Dev no epic', () => {
    const po = defaultPermissionsForRoleKey('product_owner');
    const ba = defaultPermissionsForRoleKey('business_analyst');
    const sm = defaultPermissionsForRoleKey('scrum_master');
    const qa = defaultPermissionsForRoleKey('qa_engineer');
    const dev = defaultPermissionsForRoleKey('backend_developer');
    assert.equal(po.includes('task:create'), false);
    assert.ok(po.includes('story:create'));
    assert.ok(po.includes('epic:create'));
    assert.ok(ba.includes('story:create'));
    assert.ok(ba.includes('epic:create'));
    assert.equal(ba.includes('backlog:prioritize'), false);
    assert.ok(sm.includes('sprint:start'));
    assert.equal(sm.includes('story:create'), false);
    assert.ok(qa.includes('bug:create'));
    assert.ok(qa.includes('task:create'));
    assert.equal(dev.includes('epic:create'), false);
    assert.ok(dev.includes('task:create'));
    assert.ok(dev.includes('bug:create'));
  });

  it('normalize drops unknown keys', () => {
    const n = normalizePermissionList(['task:view', 'hack:root', 'TASK:CREATE']);
    assert.deepEqual(n, ['task:view', 'task:create']);
  });

  it('sprint:delete is a known matrix key and survives normalize', () => {
    assert.ok(PROJECT_PERMISSION_KEYS.includes('sprint:delete'));
    assert.deepEqual(
      normalizePermissionList(['sprint:view', 'sprint:delete', 'sprint:close']),
      ['sprint:view', 'sprint:delete', 'sprint:close']
    );
    assert.deepEqual(assertKnownPermissionList(['sprint:delete', 'task:view']).sort(), [
      'sprint:delete',
      'task:view',
    ]);
    const split = splitPermissionList(['sprint:delete', 'hack:root']);
    assert.deepEqual(split.valid, ['sprint:delete']);
    assert.deepEqual(split.unknown, ['hack:root']);
    assert.throws(() => assertKnownPermissionList(['sprint:delete', 'hack:root']), /hack:root/);
  });
});
