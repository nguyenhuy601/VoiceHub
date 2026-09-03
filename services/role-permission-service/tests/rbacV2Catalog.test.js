const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCatalogIntegrity,
  MASTER_PERMISSIONS,
  TEMPLATE_DEFINITIONS,
  CATEGORIES,
  MODULES,
  isValidMasterPermission,
  isProjectMasterPermission,
  isProjectPackTemplateKey,
  PROJECT_PACK_TEMPLATE_KEYS,
  stripProjectGrantsUnlessProjectPack,
  materializeLegacyPermissions,
  resolveMasterKeysForLegacyAction,
  buildCatalogTree,
  getTemplateDefinition,
} = require('../src/config/rbacV2Catalog');
const { buildGroupName } = require('../src/services/rbacV2.service');

test('T1 catalog integrity — no duplicate keys, templates subset of master', () => {
  assert.equal(assertCatalogIntegrity(), true);

  const catKeys = CATEGORIES.map((c) => c.key);
  assert.equal(new Set(catKeys).size, catKeys.length);

  const modKeys = MODULES.map((m) => m.key);
  assert.equal(new Set(modKeys).size, modKeys.length);

  assert.equal(new Set(MASTER_PERMISSIONS).size, MASTER_PERMISSIONS.length);

  for (const tpl of TEMPLATE_DEFINITIONS) {
    for (const g of tpl.grants) {
      assert.equal(isValidMasterPermission(g), true, `template ${tpl.key} has invalid ${g}`);
    }
  }

  const tree = buildCatalogTree();
  assert.ok(tree.some((c) => c.key === 'system'));
  assert.ok(tree.some((c) => c.key === 'organization'));
  assert.ok(tree.some((c) => c.key === 'project'));
  assert.ok(tree.some((c) => c.key === 'organization' && c.modules?.some((m) => m.key === 'organization.position')));
  assert.ok(tree.some((c) => c.key === 'organization' && c.modules?.some((m) => m.key === 'organization.organization_role')));
  assert.ok(tree.some((c) => c.key === 'organization' && c.modules?.some((m) => m.key === 'organization.skill_registry')));
  assert.equal(isValidMasterPermission('organization.skill_registry.review'), true);
});

test('skill registry review grant on delivery templates', () => {
  const orgAdmin = getTemplateDefinition('organization_admin');
  assert.ok(orgAdmin.grants.includes('organization.skill_registry.review'));
  assert.ok(orgAdmin.grants.includes('organization.skill_registry.view'));

  const pm = getTemplateDefinition('project_manager');
  assert.ok(pm.grants.includes('organization.skill_registry.review'));

  const po = getTemplateDefinition('product_owner');
  assert.ok(po.grants.includes('organization.skill_registry.review'));

  const dev = getTemplateDefinition('developer');
  assert.equal(dev.grants.includes('organization.skill_registry.review'), false);
});

test('T4b org permission pack templates omit project.*; project_admin keeps them', () => {
  for (const key of ['organization_admin', 'department_manager', 'viewer']) {
    const tpl = getTemplateDefinition(key);
    assert.ok(tpl, key);
    assert.equal(isProjectPackTemplateKey(key), false);
    assert.equal(
      tpl.grants.some(isProjectMasterPermission),
      false,
      `${key} must not grant project.*`
    );
  }

  const projectAdmin = getTemplateDefinition('project_admin');
  assert.ok(projectAdmin);
  assert.equal(isProjectPackTemplateKey('project_admin'), true);
  assert.ok(projectAdmin.grants.some((k) => k === 'project.task.view'));
  assert.ok(projectAdmin.grants.some((k) => k === 'project.change_request.view'));
  assert.ok(projectAdmin.grants.some((k) => k.startsWith('project.')));

  const pm = getTemplateDefinition('project_manager');
  assert.ok(pm.grants.includes('project.task.view'));
});

test('T5 stripProjectGrantsUnlessProjectPack — org pack drops project.task.view; project_admin keeps it', () => {
  const mixed = ['organization.employee.view', 'project.task.view', 'communication.chat.send'];
  assert.deepEqual(stripProjectGrantsUnlessProjectPack(mixed, 'organization_admin').sort(), [
    'communication.chat.send',
    'organization.employee.view',
  ]);
  assert.deepEqual(stripProjectGrantsUnlessProjectPack(mixed, 'department_manager').sort(), [
    'communication.chat.send',
    'organization.employee.view',
  ]);
  assert.deepEqual(stripProjectGrantsUnlessProjectPack(mixed, 'project_admin').sort(), mixed.sort());
  assert.deepEqual(stripProjectGrantsUnlessProjectPack(mixed, 'developer').sort(), mixed.sort());
  assert.equal(isProjectMasterPermission('project.task.view'), true);
  assert.equal(isProjectMasterPermission('organization.position.view'), false);
});

test('T2 clone naming — specialization + template; Other requires custom name', () => {
  const tpl = getTemplateDefinition('developer');
  assert.ok(tpl);

  assert.equal(
    buildGroupName({ specialization: 'Backend', templateLabel: tpl.label }),
    'Backend Developer'
  );
  assert.equal(
    buildGroupName({ specialization: '', templateLabel: tpl.label }),
    'Developer'
  );

  assert.throws(
    () =>
      buildGroupName({
        specialization: 'Other',
        templateLabel: tpl.label,
        allowOtherName: true,
        otherName: '',
      }),
    /custom|Other|bắt buộc/i
  );

  assert.equal(
    buildGroupName({
      specialization: 'Other',
      templateLabel: tpl.label,
      allowOtherName: true,
      otherName: 'Custom Squad Lead',
    }),
    'Custom Squad Lead'
  );
});

test('T3 grant guard — only master catalog keys are valid', () => {
  assert.equal(isValidMasterPermission('project.task.view'), true);
  assert.equal(isValidMasterPermission('project.task.hack'), false);
  assert.equal(isValidMasterPermission('foo.bar.baz'), false);
});

test('T4 permission evaluation helpers — legacy action maps to master; materialize union', () => {
  const masters = resolveMasterKeysForLegacyAction('task:read');
  assert.ok(masters.includes('project.task.view'));

  const roleWrite = resolveMasterKeysForLegacyAction('role:write');
  assert.ok(roleWrite.includes('system.permission_group.clone'));

  const grants = ['project.task.view', 'project.task.create', 'organization.employee.view'];
  const legacy = materializeLegacyPermissions(grants);
  const task = legacy.find((p) => p.resource === 'task');
  assert.ok(task);
  assert.ok(task.actions.includes('read'));
  assert.ok(task.actions.includes('write'));

  const user = legacy.find((p) => p.resource === 'user');
  assert.ok(user);
  assert.ok(user.actions.includes('read') || user.actions.includes('view'));

  // Union simulation: two group grant sets
  const g1 = ['project.task.view'];
  const g2 = ['communication.chat.send'];
  const union = [...new Set([...g1, ...g2])];
  assert.deepEqual(union.sort(), ['communication.chat.send', 'project.task.view'].sort());
});

test('org structure/branch/division/policy keys exist and department_manager has invite', () => {
  for (const key of [
    'organization.structure.view',
    'organization.structure.update',
    'organization.branch.create',
    'organization.division.update',
    'organization.master_data.update',
    'organization.policy.update',
  ]) {
    assert.equal(isValidMasterPermission(key), true, key);
  }
  const dm = getTemplateDefinition('department_manager');
  assert.ok(dm.grants.includes('organization.employee.invite'));
  const tree = buildCatalogTree();
  const org = tree.find((c) => c.key === 'organization');
  assert.ok(org.modules.some((m) => m.key === 'organization.branch'));
  assert.ok(org.modules.some((m) => m.key === 'organization.structure'));
  assert.ok(PROJECT_PACK_TEMPLATE_KEYS.includes('project_admin'));
});
