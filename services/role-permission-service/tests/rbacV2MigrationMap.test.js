const test = require('node:test');
const assert = require('node:assert/strict');

const {
  templateKeyForOrgRole,
  templateKeyForProjectRole,
  ORG_ROLE_TO_TEMPLATE,
  PROJECT_ROLE_TO_TEMPLATE,
} = require('../src/config/rbacV2RoleTemplateMap');
const { getTemplateDefinition, SYSTEM_TEMPLATE_KEYS } = require('../src/config/rbacV2Catalog');

test('T5 rebind map — org/project role keys resolve to known templates', () => {
  for (const [key, tpl] of Object.entries(ORG_ROLE_TO_TEMPLATE)) {
    assert.ok(SYSTEM_TEMPLATE_KEYS.has(tpl), `org role ${key} → missing template ${tpl}`);
    assert.ok(getTemplateDefinition(tpl));
  }
  for (const [key, tpl] of Object.entries(PROJECT_ROLE_TO_TEMPLATE)) {
    assert.ok(SYSTEM_TEMPLATE_KEYS.has(tpl), `project role ${key} → missing template ${tpl}`);
    assert.ok(getTemplateDefinition(tpl));
  }
  assert.equal(templateKeyForOrgRole('department_manager'), 'department_manager');
  assert.equal(templateKeyForProjectRole('qa_engineer'), 'qa');
  assert.equal(templateKeyForOrgRole('unknown_xyz'), 'viewer');
});

test('T1 membership role → templateKey (rebind policy)', () => {
  const {
    membershipRoleToTemplateKey,
    MEMBERSHIP_ROLE_TO_TEMPLATE,
  } = require('../src/config/rbacV2RoleTemplateMap');
  assert.equal(membershipRoleToTemplateKey('owner'), 'organization_admin');
  assert.equal(membershipRoleToTemplateKey('admin'), 'organization_admin');
  assert.equal(membershipRoleToTemplateKey('hr'), 'department_manager');
  assert.equal(membershipRoleToTemplateKey('member'), 'viewer');
  assert.equal(membershipRoleToTemplateKey('unknown'), 'viewer');
  assert.equal(MEMBERSHIP_ROLE_TO_TEMPLATE.owner, 'organization_admin');
});

test('T2 viewer/admin/dept_manager grants include chat:read materialize', () => {
  const {
    getTemplateDefinition,
    materializeLegacyPermissions,
  } = require('../src/config/rbacV2Catalog');
  const permissionService = require('../src/services/permission.service');

  for (const key of ['organization_admin', 'viewer', 'department_manager']) {
    const tpl = getTemplateDefinition(key);
    assert.ok(tpl, key);
    const perms = materializeLegacyPermissions(tpl.grants);
    assert.equal(
      permissionService.hasPermission(perms, 'chat:read'),
      true,
      `${key} must grant chat:read`
    );
  }
});
