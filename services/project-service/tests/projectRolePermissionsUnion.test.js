/**
 * Single-key permission gates (no dual OR) + Admin union for settings:update.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  matrixPermissionsFromRoleKeys,
  unionPermissionsFromRoles,
  hasPermission,
  permissionsToBoardCapabilities,
  applySodLockedPermissions,
  sodLockedPermissionsForRoleKey,
  seedPermissionsForRoleKey,
  defaultPermissionsForRoleKey,
} = require('../src/utils/project/projectPermissionMatrix');

describe('project role permissions — single-key gates', () => {
  const baRole = {
    key: 'business_analyst',
    permissions: ['settings:view', 'settings:update'],
  };

  it('matrix and union share doc SoT (Admin extras on BA doc)', () => {
    const matrix = matrixPermissionsFromRoleKeys([baRole]);
    const union = unionPermissionsFromRoles([baRole]);
    assert.equal(hasPermission(matrix, 'settings:update'), true);
    assert.equal(hasPermission(union, 'settings:view'), true);
    assert.equal(hasPermission(union, 'settings:update'), true);
  });

  it('hydrated doc can revoke baseline (no CODE_DEFAULT re-merge)', () => {
    const poRevoked = unionPermissionsFromRoles([
      {
        key: 'product_owner',
        permissions: ['project:view', 'project:roles', 'task:view'],
      },
    ]);
    assert.equal(hasPermission(poRevoked, 'project:roles'), true);
    assert.equal(hasPermission(poRevoked, 'backlog:prioritize'), false);
    assert.equal(hasPermission(poRevoked, 'handover:accept'), false);
  });

  it('canUpdateSettings is settings:update; canManageLists is board:manage_lists', () => {
    const capsFromAdmin = permissionsToBoardCapabilities(unionPermissionsFromRoles([baRole]));
    assert.equal(capsFromAdmin.canUpdateSettings, true);
    assert.equal(capsFromAdmin.canManageLists, false);

    const capsMatrixBa = permissionsToBoardCapabilities(matrixPermissionsFromRoleKeys([baRole]));
    assert.equal(capsMatrixBa.canUpdateSettings, true);

    const pm = unionPermissionsFromRoles([{ key: 'project_manager', permissions: [] }]);
    const capsPm = permissionsToBoardCapabilities(pm);
    assert.equal(hasPermission(pm, 'project:edit'), true);
    assert.equal(hasPermission(pm, 'settings:update'), true);
    assert.equal(hasPermission(pm, 'board:manage_lists'), true);
    assert.equal(hasPermission(pm, 'board:admin'), true);
    assert.equal(capsPm.canUpdateSettings, true);
    assert.equal(capsPm.canManageBoard, true);
    assert.equal(capsPm.canManageLists, true);

    const editOnly = permissionsToBoardCapabilities(['project:view', 'project:edit']);
    assert.equal(editOnly.canManageBoard, false);
    assert.equal(hasPermission(pm, 'members:manage'), true);
    assert.equal(hasPermission(pm, 'project:archive'), true);

    const settingsOnly = permissionsToBoardCapabilities([
      'project:view',
      'settings:update',
    ]);
    assert.equal(settingsOnly.canUpdateSettings, true);
    assert.equal(settingsOnly.canManageLists, false);
  });

  it('PO/PM have project:roles; PO lacks settings:update', () => {
    const po = unionPermissionsFromRoles([{ key: 'product_owner', permissions: [] }]);
    const pm = unionPermissionsFromRoles([{ key: 'project_manager', permissions: [] }]);
    assert.equal(hasPermission(po, 'project:roles'), true);
    assert.equal(hasPermission(po, 'settings:update'), false);
    assert.equal(hasPermission(pm, 'project:roles'), true);
  });

  it('board caps do not OR archive into canManageBoard', () => {
    const archiveOnly = permissionsToBoardCapabilities(['project:view', 'project:archive']);
    assert.equal(archiveOnly.canManageBoard, false);
    assert.equal(archiveOnly.canUpdateSettings, false);
  });

  it('PM has distinct project:complete and project:archive', () => {
    const pm = unionPermissionsFromRoles([{ key: 'project_manager', permissions: [] }]);
    assert.equal(hasPermission(pm, 'project:complete'), true);
    assert.equal(hasPermission(pm, 'project:archive'), true);
    assert.equal(hasPermission(pm, 'board:admin'), true);
  });

  it('move/status caps use task:change_status only', () => {
    const updateOnly = permissionsToBoardCapabilities([
      'project:view',
      'task:update',
      'task:assign',
    ]);
    assert.equal(updateOnly.canMoveCards, false);
    assert.equal(updateOnly.canChangeStatus, false);
    const status = permissionsToBoardCapabilities(['project:view', 'task:change_status']);
    assert.equal(status.canMoveCards, true);
    assert.equal(status.canChangeStatus, true);
  });

  it('seedPermissionsForRoleKey prefers org list; empty falls back to CODE_DEFAULT', () => {
    const fromOrg = seedPermissionsForRoleKey('product_owner', ['project:view', 'project:roles']);
    assert.deepEqual(fromOrg, ['project:view', 'project:roles']);
    const fromCode = seedPermissionsForRoleKey('product_owner', []);
    assert.equal(hasPermission(fromCode, 'project:roles'), true);
    assert.equal(
      fromCode.length,
      defaultPermissionsForRoleKey('product_owner').length
    );
  });

  it('revoke task:assign on hydrated developer doc sticks', () => {
    const baseline = defaultPermissionsForRoleKey('developer');
    assert.equal(hasPermission(baseline, 'task:assign'), true);
    const revoked = baseline.filter((p) => p !== 'task:assign');
    const effective = unionPermissionsFromRoles([
      { key: 'developer', permissions: revoked },
    ]);
    assert.equal(hasPermission(effective, 'task:assign'), false);
    assert.equal(hasPermission(effective, 'task:view'), true);
  });

  it('Admin org template change does not alter project-scoped doc resolve', () => {
    const orgTemplateAfterAdminEdit = {
      key: 'product_owner',
      permissions: ['project:view', 'project:roles', 'settings:update'],
    };
    const projectCloneUnchanged = {
      key: 'product_owner',
      permissions: ['project:view', 'project:roles', 'task:view'],
    };
    // Runtime chỉ đọc doc membership (project clone) — không đọc org template.
    const effective = unionPermissionsFromRoles([projectCloneUnchanged]);
    assert.equal(hasPermission(effective, 'settings:update'), false);
    assert.equal(hasPermission(effective, 'task:view'), true);
    // Org template vẫn seed được cho project mới / reset.
    const seeded = seedPermissionsForRoleKey(
      'product_owner',
      orgTemplateAfterAdminEdit.permissions
    );
    assert.equal(hasPermission(seeded, 'settings:update'), true);
  });

  it('SoD locked keys cannot be stripped on PATCH', () => {
    const locked = sodLockedPermissionsForRoleKey('product_owner');
    assert.equal(locked.includes('handover:accept'), true);
    assert.equal(locked.includes('analysis:po_review'), true);
    const patched = applySodLockedPermissions('product_owner', ['project:view', 'project:roles']);
    assert.equal(hasPermission(patched, 'project:view'), true);
    assert.equal(hasPermission(patched, 'handover:accept'), true);
    assert.equal(hasPermission(patched, 'analysis:po_review'), true);
    assert.equal(hasPermission(patched, 'backlog:prioritize'), false);
  });

  it('AI confirm is task:ai_confirm; activity is activity:view', () => {
    const assignOnly = permissionsToBoardCapabilities(['project:view', 'task:assign']);
    assert.equal(assignOnly.canUseAiConfirm, false);
    const ai = permissionsToBoardCapabilities(['project:view', 'task:ai_confirm']);
    assert.equal(ai.canUseAiConfirm, true);

    const view = unionPermissionsFromRoles([{ key: 'developer', permissions: [] }]);
    assert.equal(hasPermission(view, 'activity:view'), true);
    assert.equal(hasPermission(view, 'task:ai_confirm'), true);
    assert.equal(hasPermission(view, 'report:view'), true);

    const sm = unionPermissionsFromRoles([{ key: 'scrum_master', permissions: [] }]);
    assert.equal(hasPermission(sm, 'sprint:create'), true);
    assert.equal(hasPermission(sm, 'sprint:start'), true);
    assert.equal(hasPermission(sm, 'sprint:close'), true);
  });
});
