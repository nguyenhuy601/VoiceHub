import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listIdToPlanningStatus, planningStatusToListId } from './planningBoardStatus.js';

const LISTS = [
  { _id: 'en-todo', title: 'Todo', statusKey: 'todo', order: 1 },
  { _id: 'en-doing', title: 'In progress', statusKey: 'doing', order: 2 },
  { _id: 'en-review', title: 'Review', statusKey: 'review', order: 3 },
  { _id: 'en-done', title: 'Done', statusKey: 'done', order: 4 },
];

test('planningStatusToListId: statusKey khớp cột', () => {
  assert.equal(planningStatusToListId('todo', LISTS), 'en-todo');
  assert.equal(planningStatusToListId('doing', LISTS), 'en-doing');
  assert.equal(planningStatusToListId('done', LISTS), 'en-done');
});

test('planningStatusToListId: legacy planned/active map bucket', () => {
  assert.equal(planningStatusToListId('planned', LISTS), 'en-todo');
  assert.equal(planningStatusToListId('active', LISTS), 'en-doing');
});

test('planningStatusToListId: list rỗng không crash', () => {
  assert.equal(planningStatusToListId('planned', []), '');
  assert.equal(planningStatusToListId('todo', null), '');
});

test('listIdToPlanningStatus: lấy statusKey của cột', () => {
  assert.equal(listIdToPlanningStatus('en-todo', LISTS), 'todo');
  assert.equal(listIdToPlanningStatus('en-review', LISTS), 'review');
  assert.equal(listIdToPlanningStatus('', LISTS), '');
  assert.equal(listIdToPlanningStatus('missing', LISTS), '');
});
