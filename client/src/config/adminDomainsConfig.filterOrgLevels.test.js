import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterOrgStructureSections,
  ORG_STRUCTURE_ALWAYS_SECTIONS,
} from './adminDomainsConfig.js';

const sections = [
  { id: 'dynamic' },
  { id: 'departments' },
  { id: 'teams' },
  { id: 'positions' },
  { id: 'divisions' },
  { id: 'branches' },
];

test('not setup shows only positions', () => {
  const out = filterOrgStructureSections(sections, [], { setupCompleted: false });
  assert.deepEqual(
    out.map((s) => s.id),
    ['positions']
  );
});

test('setup unknown (loading) hides hierarchy', () => {
  const out = filterOrgStructureSections(sections, [], {});
  assert.deepEqual(
    out.map((s) => s.id),
    ['positions']
  );
});

test('legacy compat levels shows branch division department team + positions, hides dynamic', () => {
  const levels = [
    { key: 'branch', enabled: true },
    { key: 'division', enabled: true },
    { key: 'department', enabled: true },
    { key: 'team', enabled: true },
  ];
  const ids = filterOrgStructureSections(sections, levels, { setupCompleted: true }).map((s) => s.id);
  assert.deepEqual(
    ids.sort(),
    ['branches', 'departments', 'divisions', 'positions', 'teams'].sort()
  );
  assert.ok(!ids.includes('dynamic'));
  assert.ok(ORG_STRUCTURE_ALWAYS_SECTIONS.has('positions'));
});

test('functional template hides branch and division; hides dynamic', () => {
  const levels = [
    { key: 'department', enabled: true },
    { key: 'team', enabled: true },
  ];
  const ids = filterOrgStructureSections(sections, levels, { setupCompleted: true }).map((s) => s.id);
  assert.ok(!ids.includes('branches'));
  assert.ok(!ids.includes('divisions'));
  assert.ok(!ids.includes('dynamic'));
  assert.ok(ids.includes('departments'));
  assert.ok(ids.includes('teams'));
  assert.ok(ids.includes('positions'));
});

test('enterprise-software hides branch; shows division department team', () => {
  const levels = [
    { key: 'division', enabled: true },
    { key: 'department', enabled: true },
    { key: 'team', enabled: true },
  ];
  const ids = filterOrgStructureSections(sections, levels, { setupCompleted: true }).map((s) => s.id);
  assert.ok(!ids.includes('branches'));
  assert.ok(!ids.includes('dynamic'));
  assert.deepEqual(
    ids.sort(),
    ['departments', 'divisions', 'positions', 'teams'].sort()
  );
});

test('disabled level key is ignored', () => {
  const levels = [
    { key: 'department', enabled: true },
    { key: 'branch', enabled: false },
  ];
  const ids = filterOrgStructureSections(sections, levels, { setupCompleted: true }).map((s) => s.id);
  assert.ok(!ids.includes('branches'));
  assert.ok(ids.includes('departments'));
});
