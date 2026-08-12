const test = require('node:test');
const assert = require('node:assert/strict');

// Mirror role.service isHierarchyRoleName — hierarchy revoke triggers org unplace.
function isHierarchyRoleName(name) {
  const lower = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/(?:^|\s|[•·_-])(div|dep|team)_[a-z0-9_-]{6,}\b/.test(lower)) return true;
  if (/^(khoi|khối|phong ban|phòng ban|phong|phòng|team|chi nhanh|chi nhánh)\b/.test(lower)) return true;
  if (/\b(khoi|khối|phong ban|phòng ban|phong|phòng|team)\s*:/.test(lower)) return true;
  return false;
}

test('T3: pack role is not hierarchy', () => {
  assert.equal(isHierarchyRoleName('Gói quyền — Viewer'), false);
  assert.equal(isHierarchyRoleName('Gói quyền — Quản trị'), false);
});

test('T2: department hierarchy role names detected', () => {
  assert.equal(isHierarchyRoleName('Phòng ban: Front End · dep_abc123'), true);
  assert.equal(isHierarchyRoleName('Team: API · team_xyz789'), true);
  assert.equal(isHierarchyRoleName('Khối: Kỹ thuật · div_abc123'), true);
});
