import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addIdToSetRef,
  canExpandListRow,
  collectLoadedIdsFromTree,
  flattenExpandedRows,
  hasLocalChildCards,
  isScrollNearBottom,
  LIST_ROOT_PAGE_SIZE,
  nextRootLimit,
  removeIdFromSetRef,
  shouldFetchListChildren,
  sliceTreeRoots,
} from './projectHubListLazy.js';

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

test('canExpandListRow: chỉ hasChildren hoặc loading — không speculative childTypes', () => {
  assert.equal(canExpandListRow({ childTypes: ['subtask'], loaded: false, hasChildren: false }), false);
  assert.equal(canExpandListRow({ childTypes: ['feature'], loaded: false }), false);
  assert.equal(canExpandListRow({ hasChildren: true }), true);
  assert.equal(canExpandListRow({ loading: true }), true);
  assert.equal(canExpandListRow({ hasChildren: true, loading: false }), true);
  assert.equal(canExpandListRow({}), false);
});

test('shouldFetchListChildren: skip khi hasChildren hoặc loaded; fetch khi thiếu', () => {
  assert.equal(shouldFetchListChildren({ hasChildren: true }), false);
  assert.equal(shouldFetchListChildren({ loaded: true }), false);
  assert.equal(shouldFetchListChildren({ loading: true }), false);
  assert.equal(shouldFetchListChildren({}), true);
  assert.equal(shouldFetchListChildren({ loaded: false, hasChildren: false }), true);
});

test('shouldFetchListChildren: hadError luôn retry (trừ đang loading)', () => {
  assert.equal(shouldFetchListChildren({ hadError: true, hasChildren: true }), true);
  assert.equal(shouldFetchListChildren({ hadError: true, loaded: true }), true);
  assert.equal(shouldFetchListChildren({ hadError: true, loading: true }), false);
});

test('collectLoadedIdsFromTree: chỉ node có children', () => {
  const tree = [
    {
      id: 'planning:e1',
      children: [
        { id: 'planning:f1', children: [{ id: 'card:c1', children: [] }] },
        { id: 'planning:f2', children: [] },
      ],
    },
    { id: 'planning:e2', children: [] },
  ];
  const ids = collectLoadedIdsFromTree(tree);
  assert.equal(ids.has('planning:e1'), true);
  assert.equal(ids.has('planning:f1'), true);
  assert.equal(ids.has('planning:f2'), false);
  assert.equal(ids.has('card:c1'), false);
  assert.equal(ids.has('planning:e2'), false);
});

test('hasLocalChildCards: theo parentTaskId / feature / epic', () => {
  const cards = [
    { _id: 'c1', parentTaskId: 'p1' },
    { _id: 'c2', featureId: 'f1' },
    { _id: 'c3', epicId: 'e1' },
    { _id: 'c4', epicId: 'e1', featureId: 'f1' },
  ];
  assert.equal(hasLocalChildCards(cards, 'p1'), true);
  assert.equal(hasLocalChildCards(cards, 'p1', 'task'), true);
  assert.equal(hasLocalChildCards(cards, 'missing'), false);
  assert.equal(hasLocalChildCards(cards, 'f1', 'feature'), true);
  assert.equal(hasLocalChildCards(cards, 'e1', 'epic'), true);
  assert.equal(hasLocalChildCards(cards, 'f1', 'epic'), false);
});

test('addIdToSetRef / removeIdFromSetRef: sync trước setState', () => {
  const ref = { current: new Set() };
  addIdToSetRef(ref, 'a');
  assert.equal(ref.current.has('a'), true);
  addIdToSetRef(ref, 'a');
  assert.equal(ref.current.size, 1);
  removeIdFromSetRef(ref, 'a');
  assert.equal(ref.current.has('a'), false);
});

test('sliceTreeRoots / nextRootLimit: 5 root / trang', () => {
  const tree = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, children: [] }));
  assert.equal(sliceTreeRoots(tree, LIST_ROOT_PAGE_SIZE).length, 5);
  assert.deepEqual(
    sliceTreeRoots(tree, 5).map((n) => n.id),
    ['r0', 'r1', 'r2', 'r3', 'r4']
  );
  assert.equal(nextRootLimit(5, 7), 7);
  assert.equal(nextRootLimit(0, 7), 5);
  assert.equal(nextRootLimit(7, 7), 7);
  assert.equal(sliceTreeRoots(null, 5).length, 0);
});

test('isScrollNearBottom: gần đáy theo threshold', () => {
  assert.equal(isScrollNearBottom(null), false);
  assert.equal(
    isScrollNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }, 80),
    true
  );
  assert.equal(
    isScrollNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 100 }, 80),
    false
  );
});
