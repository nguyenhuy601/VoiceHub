const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCatalogIntegrity,
  MASTER_PERMISSIONS,
  TEMPLATE_DEFINITIONS,
  CATEGORIES,
  MODULES,
  isValidMasterPermission,
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
