import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryKeys } from '../../../lib/queryKeys.js';
import {
  boardDetailQueryScope,
  changeRequestsFilterHash,
  mapAssignableMemberRows,
  unwrapProjectMembersList,
  unwrapProjectPayload,
} from './projectHubQueryHelpers.js';

test('boardDetailQueryScope: lists vs full', () => {
  assert.equal(boardDetailQueryScope(false), 'lists');
  assert.equal(boardDetailQueryScope(true), 'full');
  assert.deepEqual(queryKeys.projectHub.boardDetail('b1', 'lists'), [
    'projectHub',
    'board',
    'b1',
    'lists',
  ]);
  assert.deepEqual(queryKeys.projectHub.boardDetail('b1', 'full'), [
    'projectHub',
    'board',
    'b1',
    'full',
  ]);
});

test('changeRequestsFilterHash: ổn định theo filter', () => {
  const a = changeRequestsFilterHash({
    q: 'x',
    type: 'scope_change',
    status: 'draft',
    priority: 'high',
    sort: 'createdAt:desc',
    page: 2,
    size: 20,
  });
  const b = changeRequestsFilterHash({
    q: 'x',
    type: 'scope_change',
    status: 'draft',
    priority: 'high',
    sort: 'createdAt:desc',
    page: 2,
    size: 20,
  });
  const c = changeRequestsFilterHash({
    q: 'y',
    type: 'scope_change',
    status: 'draft',
    priority: 'high',
    sort: 'createdAt:desc',
    page: 2,
    size: 20,
  });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.deepEqual(queryKeys.projectHub.changeRequests('p1', a), [
    'projectHub',
    'changeRequests',
    'p1',
    a,
  ]);
});

test('boards / roleCatalog / activity / files keys', () => {
  assert.deepEqual(queryKeys.projectHub.boards('p1', 'o1'), [
    'projectHub',
    'boards',
    'p1',
    'o1',
  ]);
  assert.deepEqual(queryKeys.projectHub.roleCatalog('p1'), [
    'projectHub',
    'roleCatalog',
    'p1',
  ]);
  assert.deepEqual(queryKeys.projectHub.activity('p1', 10), [
    'projectHub',
    'activity',
    'p1',
    10,
  ]);
  assert.deepEqual(queryKeys.projectHub.files('p1'), ['projectHub', 'files', 'p1']);
});

test('planningItems / sprints / assignable keys', () => {
  assert.deepEqual(queryKeys.projectHub.planningItems('p1'), [
    'projectHub',
    'planningItems',
    'p1',
  ]);
  assert.deepEqual(queryKeys.projectHub.sprints('p1'), ['projectHub', 'sprints', 'p1']);
  assert.deepEqual(queryKeys.projectHub.assignableMembers('b1'), [
    'projectHub',
    'assignable',
    'b1',
  ]);
});

test('unwrapProjectPayload / members / assignable rows', () => {
  assert.deepEqual(unwrapProjectPayload({ data: { data: { id: 1 } } }), { id: 1 });
  assert.deepEqual(unwrapProjectMembersList([{ id: 'u1' }]), [{ id: 'u1' }]);
  assert.deepEqual(unwrapProjectMembersList({ members: [{ id: 'u2' }] }), [{ id: 'u2' }]);
  assert.deepEqual(unwrapProjectMembersList({ items: [{ id: 'u3' }] }), [{ id: 'u3' }]);
  assert.deepEqual(unwrapProjectMembersList(null), []);

  const mapped = mapAssignableMemberRows({
    members: [
      { userId: 'a', displayName: 'Alice', username: 'alice', avatar: '/a.png' },
      { id: '', displayName: 'Skip' },
      { userId: 'b', name: 'Bob' },
    ],
  });
  assert.deepEqual(mapped, [
    { id: 'a', name: 'Alice', username: 'alice', avatarUrl: '/a.png' },
    { id: 'b', name: 'Bob', username: '', avatarUrl: '' },
  ]);
});
