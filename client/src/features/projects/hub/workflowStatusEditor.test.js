import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ensureAdjacentTransitions,
  ensureReopenFromDone,
  filterTransitionsByStateKeys,
  mergeEditorItemsToStates,
  statesToEditorItems,
} from './workflowStatusEditor.js';

test('statesToEditorItems: sửa mojibake label tiếng Việt', () => {
  const items = statesToEditorItems([
    { key: 'in_progress', label: 'Äang xá»­ lÃ½', order: 1 },
    { key: 'cho_ncc', label: 'Chá» NCC', order: 2 },
  ]);
  assert.equal(items[0].label, 'Đang xử lý');
  assert.equal(items[1].label, 'Chờ NCC');
});

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

test('ensureAdjacentTransitions: bổ sung cạnh liền kề khi thêm status', () => {
  const states = [
    { key: 'todo', order: 1 },
    { key: 'in_progress', order: 2 },
    { key: 'blocked', order: 3 },
    { key: 'done', order: 4 },
  ];
  const next = ensureAdjacentTransitions(
    [{ fromKey: 'todo', toKey: 'in_progress', name: 'Start' }],
    states
  );
  const ids = next.map((t) => `${t.fromKey}→${t.toKey}`);
  assert.ok(ids.includes('todo→in_progress'));
  assert.ok(ids.includes('in_progress→blocked'));
  assert.ok(ids.includes('blocked→done'));
});

test('ensureAdjacentTransitions: không nhân đôi cạnh đã có', () => {
  const states = [
    { key: 'todo', order: 1 },
    { key: 'done', order: 2 },
  ];
  const next = ensureAdjacentTransitions(
    [{ fromKey: 'todo', toKey: 'done', name: 'Finish' }],
    states
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].name, 'Finish');
});

test('ensureReopenFromDone: bổ sung done → in_progress khi thiếu (sau thêm cancelled)', () => {
  const states = [
    { key: 'todo', order: 1 },
    { key: 'in_progress', order: 2 },
    { key: 'review', order: 3 },
    { key: 'done', order: 4 },
    { key: 'cancelled', order: 5 },
  ];
  const next = ensureReopenFromDone(
    [
      { fromKey: 'review', toKey: 'done', name: 'Done' },
      { fromKey: 'done', toKey: 'cancelled', name: 'done → cancelled' },
    ],
    states
  );
  const ids = next.map((t) => `${t.fromKey}→${t.toKey}`);
  assert.ok(ids.includes('done→in_progress'));
  assert.ok(ids.includes('done→cancelled'));
  assert.equal(next.filter((t) => t.fromKey === 'done' && t.toKey === 'in_progress').length, 1);
});

test('ensureReopenFromDone: không nhân đôi Reopen đã có', () => {
  const states = [
    { key: 'done', order: 1 },
    { key: 'in_progress', order: 2 },
  ];
  const next = ensureReopenFromDone(
    [{ fromKey: 'done', toKey: 'in_progress', name: 'Reopen' }],
    states
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].name, 'Reopen');
});
