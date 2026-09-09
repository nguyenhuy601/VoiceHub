const test = require('node:test');
const assert = require('node:assert/strict');
const { isHierarchyRoleName, coercePermissionPackScope } = require('../src/utils/permissionPackScope');

test('T3: pack role is not hierarchy', () => {
  assert.equal(isHierarchyRoleName('Gói quyền — Viewer'), false);
  assert.equal(isHierarchyRoleName('Gói quyền — Quản trị'), false);
});

test('T7: permission pack scope coerced to ORGANIZATION; hierarchy name keeps requested scope', () => {
  assert.equal(coercePermissionPackScope('Gói quyền — Viewer', 'DEPARTMENT'), 'ORGANIZATION');
  assert.equal(coercePermissionPackScope('Gói quyền — Quản trị', 'GLOBAL'), 'ORGANIZATION');
  assert.equal(coercePermissionPackScope('Gói quyền — Viewer', 'ORGANIZATION'), 'ORGANIZATION');
  assert.equal(coercePermissionPackScope('Phòng ban: Front End · dep_abc123', 'DEPARTMENT'), 'DEPARTMENT');
  assert.equal(coercePermissionPackScope('Team: API · team_xyz789', 'TEAM'), 'TEAM');
  assert.throws(() => coercePermissionPackScope('Gói quyền — Viewer', 'INVALID'), /không hợp lệ/i);
});

test('T2: department hierarchy role names detected', () => {
  assert.equal(isHierarchyRoleName('Phòng ban: Front End · dep_abc123'), true);
  assert.equal(isHierarchyRoleName('Team: API · team_xyz789'), true);
  assert.equal(isHierarchyRoleName('Khối: Kỹ thuật · div_abc123'), true);
});
