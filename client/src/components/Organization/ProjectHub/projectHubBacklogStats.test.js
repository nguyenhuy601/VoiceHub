import assert from 'node:assert/strict';
import { test } from 'node:test';
import { childWorkStats } from './projectHubBacklogStats.js';

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
