import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canExpandListRow, flattenExpandedRows } from './projectHubListLazy.js';

test('flattenExpandedRows: mặc định chỉ root', () => {
  const tree = [
    {
      id: 'planning:e1',
      children: [{ id: 'card:c1', children: [{ id: 'card:s1', children: [] }] }],
    },
  ];
  assert.deepEqual(
    flattenExpandedRows(tree, new Set()).map((r) => r.node.id),
    ['planning:e1']
  );
  assert.deepEqual(
    flattenExpandedRows(tree, new Set(['planning:e1'])).map((r) => r.node.id),
    ['planning:e1', 'card:c1']
  );
});

test('canExpandListRow: chưa load + childTypes; loaded rỗng ẩn', () => {
  assert.equal(canExpandListRow({ childTypes: ['feature'], loaded: false }), true);
  assert.equal(canExpandListRow({ childTypes: ['subtask'], loaded: true, hasChildren: false }), false);
  assert.equal(canExpandListRow({ childTypes: [], loaded: false }), false);
  assert.equal(canExpandListRow({ loading: true }), true);
  assert.equal(canExpandListRow({ hasChildren: true, loaded: true, childTypes: [] }), true);
});
