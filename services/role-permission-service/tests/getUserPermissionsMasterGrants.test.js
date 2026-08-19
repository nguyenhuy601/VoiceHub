const test = require('node:test');
const assert = require('node:assert/strict');

const { packUserPermissions } = require('../src/services/permission.service');
const { materializeLegacyPermissions } = require('../src/config/rbacV2Catalog');

test('packUserPermissions — team.create keeps master key and materializes organization:write', () => {
  const packed = packUserPermissions(['organization.team.create'], [{ resource: 'task', actions: ['read'] }]);
  assert.deepEqual(packed.masterGrants, ['organization.team.create']);
  assert.deepEqual(packed.permissions, materializeLegacyPermissions(['organization.team.create']));
  const org = packed.permissions.find((p) => p.resource === 'organization');
  assert.ok(org);
  assert.ok(org.actions.includes('write'));
});

test('packUserPermissions — no grants uses legacy fallback', () => {
  const fallback = [{ resource: 'chat', actions: ['read'] }];
  const packed = packUserPermissions([], fallback);
  assert.deepEqual(packed.masterGrants, []);
  assert.deepEqual(packed.permissions, fallback);
});

test('packUserPermissions — invalid keys dropped', () => {
  const packed = packUserPermissions(['not.a.key', 'organization.team.create'], []);
  assert.deepEqual(packed.masterGrants, ['organization.team.create']);
});
