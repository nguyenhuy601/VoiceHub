import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterTransitionsByStateKeys,
  mergeEditorItemsToStates,
  statesToEditorItems,
} from './workflowStatusEditor.js';

test('statesToEditorItems: bỏ key rỗng, giữ label', () => {
  const items = statesToEditorItems([
    { key: 'todo', label: 'Todo', order: 1, isInitial: true },
    { key: '  ', label: 'bad' },
    { key: 'done', label: 'Xong', isFinal: true },
  ]);
  assert.deepEqual(
    items.map((i) => i.key),
    ['todo', 'done']
  );
  assert.equal(items[1].label, 'Xong');
});

test('mergeEditorItemsToStates: thêm cuối, xóa giữa, giữ flag cũ', () => {
  const prev = [
    { key: 'todo', label: 'Todo', order: 1, isInitial: true, isFinal: false },
    { key: 'doing', label: 'Doing', order: 2, isInitial: false, isFinal: false },
    { key: 'done', label: 'Done', order: 3, isInitial: false, isFinal: true },
  ];
  const next = mergeEditorItemsToStates(
    [
      { key: 'todo', label: 'Chưa làm' },
      { key: 'done', label: 'Done' },
      { key: 'blocked', label: 'Blocked' },
    ],
    prev
  );
  assert.deepEqual(
    next.map((s) => s.key),
    ['todo', 'done', 'blocked']
  );
  assert.equal(next[0].label, 'Chưa làm');
  assert.equal(next[0].isInitial, true);
  assert.equal(next[1].isFinal, true);
  assert.equal(next[2].order, 3);
  assert.equal(next[2].isFinal, true);
});

test('filterTransitionsByStateKeys: gỡ transition trỏ state đã xóa', () => {
  const states = [{ key: 'todo' }, { key: 'done' }];
  const kept = filterTransitionsByStateKeys(
    [
      { fromKey: 'todo', toKey: 'done' },
      { fromKey: 'todo', toKey: 'review' },
      { fromKey: 'review', toKey: 'done' },
    ],
    states
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].toKey, 'done');
});
