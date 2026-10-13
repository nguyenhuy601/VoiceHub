/**
 * Settings hub capabilities: settings:view / settings:update / project:roles (1:1, no dual with project:edit).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MASTER_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/masterData');
const {
  hasPermission,
  defaultPermissionsForRoleKey,
} = require('../src/utils/project/projectPermissionMatrix');

/** Mirror attachProjectCapabilities Settings flags (non-bypass). */
function settingsFlagsFromPermissions(permissions = [], { bypass = false } = {}) {
  const unionHas = (key) => hasPermission(permissions, key);
  return {
    canViewSettings: bypass || unionHas('settings:view'),
    canManageSettings: bypass || unionHas('settings:update'),
    canManageProjectRoles: unionHas('project:roles'),
  };
}

describe('projectSettingsCapabilities', () => {
  it('view-only: settings:view opens Settings read-only', () => {
    const flags = settingsFlagsFromPermissions(['project:view', 'settings:view']);
    assert.equal(flags.canViewSettings, true);
    assert.equal(flags.canManageSettings, false);
    assert.equal(flags.canManageProjectRoles, false);
  });

  it('settings:update enables manage; project:edit alone does not', () => {
    const withUpdate = settingsFlagsFromPermissions([
      'project:view',
      'settings:view',
      'settings:update',
    ]);
    assert.equal(withUpdate.canViewSettings, true);
    assert.equal(withUpdate.canManageSettings, true);

    const editOnly = settingsFlagsFromPermissions(['project:view', 'project:edit', 'settings:view']);
    assert.equal(editOnly.canManageSettings, false);
    assert.equal(editOnly.canViewSettings, true);
  });

  it('project:roles alone enables role matrix without settings:update', () => {
    const flags = settingsFlagsFromPermissions([
      'project:view',
      'settings:view',
      'project:roles',
    ]);
    assert.equal(flags.canViewSettings, true);
    assert.equal(flags.canManageSettings, false);
    assert.equal(flags.canManageProjectRoles, true);
  });

  it('bypass org admin / creator gets view + manage settings', () => {
    const flags = settingsFlagsFromPermissions([], { bypass: true });
    assert.equal(flags.canViewSettings, true);
    assert.equal(flags.canManageSettings, true);
  });

  it('every MASTER_PROJECT_ROLE_KEYS has non-empty default with project:view', () => {
    assert.ok(Array.isArray(MASTER_PROJECT_ROLE_KEYS) && MASTER_PROJECT_ROLE_KEYS.length > 0);
    for (const key of MASTER_PROJECT_ROLE_KEYS) {
      const perms = defaultPermissionsForRoleKey(key);
      assert.ok(Array.isArray(perms) && perms.length > 0, `empty default for ${key}`);
      assert.ok(perms.includes('project:view'), `missing project:view for ${key}`);
      // Dual-use guard: project:edit must not imply settings:update
      if (perms.includes('project:edit') && !perms.includes('settings:update')) {
        const flags = settingsFlagsFromPermissions(perms);
        assert.equal(flags.canManageSettings, false, `project:edit dual for ${key}`);
      }
    }
  });

  it('§1.5 Settings flags for representative master roles (CODE_DEFAULT)', () => {
    /** @type {Array<[string, { view: boolean, manage: boolean, roles: boolean }]>} */
    const cases = [
      ['product_owner', { view: true, manage: false, roles: true }],
      ['project_manager', { view: true, manage: true, roles: true }],
      ['business_analyst', { view: true, manage: false, roles: false }],
      ['technical_lead', { view: true, manage: false, roles: false }],
      ['backend_developer', { view: true, manage: false, roles: false }],
      ['qa_engineer', { view: true, manage: false, roles: false }],
      ['ui_ux_designer', { view: true, manage: false, roles: false }],
      ['observer', { view: true, manage: false, roles: false }],
      ['solution_architect', { view: true, manage: false, roles: false }],
      ['scrum_master', { view: true, manage: false, roles: false }],
    ];
    for (const [key, expected] of cases) {
      const flags = settingsFlagsFromPermissions(defaultPermissionsForRoleKey(key));
      assert.equal(flags.canViewSettings, expected.view, `${key} view`);
      assert.equal(flags.canManageSettings, expected.manage, `${key} manage`);
      assert.equal(flags.canManageProjectRoles, expected.roles, `${key} roles`);
    }
  });
});
