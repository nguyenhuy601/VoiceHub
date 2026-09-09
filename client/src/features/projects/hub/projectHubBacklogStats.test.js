import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsUnderParent, childWorkStats, directChildCards } from './projectHubBacklogStats.js';

const lists = [
  { _id: 'l-todo', title: 'To Do', statusKey: 'todo' },
  { _id: 'l-done', title: 'Done', statusKey: 'done' },
];

test('childWorkStats: không parent → 0', () => {
  assert.deepEqual(childWorkStats([{ parentTaskId: 'a' }], '', lists), { total: 0, done: 0 });
});

test('childWorkStats: không con → 0', () => {
  assert.deepEqual(childWorkStats([{ _id: 'c1' }], 'p1', lists), { total: 0, done: 0 });
});

test('childWorkStats: 1 To Do → 0 of 1', () => {
  assert.deepEqual(
    childWorkStats([{ _id: 'c2', parentTaskId: 'p1', listId: 'l-todo' }], 'p1', lists),
    { total: 1, done: 0 }
  );
});

test('childWorkStats: 1 Done + 1 To Do → 1 of 2', () => {
  assert.deepEqual(
    childWorkStats(
      [
        { _id: 'c2', parentTaskId: 'p1', listId: 'l-todo' },
        { _id: 'c3', parentTaskId: 'p1', listId: 'l-done' },
        { _id: 'c4', parentTaskId: 'other' },
      ],
      'p1',
      lists
    ),
    { total: 2, done: 1 }
  );
});

test('childWorkStats: parentTaskId object vẫn đếm', () => {
  assert.deepEqual(
    childWorkStats([{ _id: 'c2', parentTaskId: { _id: 'p1' }, listId: 'l-todo' }], { id: 'p1' }, lists),
    { total: 1, done: 0 }
  );
});

test('cardsUnderParent: chỉ con trực tiếp', () => {
  const cards = [
    { _id: 'c1', parentTaskId: 'p1' },
    { _id: 'c2', parentTaskId: 'p1' },
    { _id: 'c3', parentTaskId: 'c1' },
    { _id: 'c4' },
  ];
  assert.deepEqual(
    cardsUnderParent(cards, 'p1').map((c) => c._id),
    ['c1', 'c2']
  );
});

test('directChildCards / childWorkStats: Feature theo featureId, bỏ subtask', () => {
  const cards = [
    { _id: 't1', featureId: 'f1', listId: 'l-todo' },
    { _id: 't2', featureId: 'f1', listId: 'l-done' },
    { _id: 's1', featureId: 'f1', parentTaskId: 't1', listId: 'l-todo' },
    { _id: 't3', featureId: 'f2', listId: 'l-todo' },
  ];
  assert.deepEqual(
    directChildCards(cards, 'f1', 'feature').map((c) => c._id),
    ['t1', 't2']
  );
  assert.deepEqual(childWorkStats(cards, 'f1', lists, 'feature'), { total: 2, done: 1 });
});
