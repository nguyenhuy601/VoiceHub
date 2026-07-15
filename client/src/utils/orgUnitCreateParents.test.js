import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOrgUnitCreateParents } from './orgUnitCreateParents.js';

/** Levels theo từng template BE (`orgStructureTemplates.js`). */
const TEMPLATES = {
  startup: [{ key: 'team', enabled: true }],
  product: [
    { key: 'division', enabled: true },
    { key: 'team', enabled: true },
  ],
  outsourcing: [
    { key: 'division', enabled: true },
    { key: 'team', enabled: true },
  ],
  'enterprise-software': [
    { key: 'division', enabled: true },
    { key: 'department', enabled: true },
    { key: 'team', enabled: true },
  ],
  functional: [
    { key: 'department', enabled: true },
    { key: 'team', enabled: true },
  ],
  'enterprise-compat': [
    { key: 'branch', enabled: true },
    { key: 'division', enabled: true },
    { key: 'department', enabled: true },
    { key: 'team', enabled: true },
  ],
};

test('enterprise-software: khối gốc — không bắt chi nhánh', () => {
  const p = resolveOrgUnitCreateParents(TEMPLATES['enterprise-software']);
  assert.equal(p.divisionParent, null);
  assert.equal(p.departmentParent, 'division');
  assert.equal(p.teamParent, 'department');
});

test('enterprise-compat: khối dưới chi nhánh', () => {
  const p = resolveOrgUnitCreateParents(TEMPLATES['enterprise-compat']);
  assert.equal(p.divisionParent, 'branch');
  assert.equal(p.departmentParent, 'division');
  assert.equal(p.teamParent, 'department');
});

test('product/outsourcing: team dưới khối', () => {
  for (const id of ['product', 'outsourcing']) {
    const p = resolveOrgUnitCreateParents(TEMPLATES[id]);
    assert.equal(p.divisionParent, null, id);
    assert.equal(p.departmentParent, null, id);
    assert.equal(p.teamParent, 'division', id);
  }
});

test('functional: phòng ban gốc, team dưới dept', () => {
  const p = resolveOrgUnitCreateParents(TEMPLATES.functional);
  assert.equal(p.divisionParent, null);
  assert.equal(p.departmentParent, null);
  assert.equal(p.teamParent, 'department');
});

test('startup: team gốc', () => {
  const p = resolveOrgUnitCreateParents(TEMPLATES.startup);
  assert.equal(p.divisionParent, null);
  assert.equal(p.departmentParent, null);
  assert.equal(p.teamParent, null);
});

test('accepts Set of keys', () => {
  const p = resolveOrgUnitCreateParents(new Set(['division', 'department', 'team']));
  assert.equal(p.divisionParent, null);
  assert.equal(p.departmentParent, 'division');
});
