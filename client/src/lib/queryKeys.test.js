import { queryKeys } from '../lib/queryKeys.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('queryKeys shared read-models', () => {
  it('rbac.grants includes org and user', () => {
    assert.deepEqual(queryKeys.rbac.grants('o1', 'u1'), ['rbac', 'grants', 'o1', 'u1']);
  });

  it('org.levels and structure twin keys', () => {
    assert.deepEqual(queryKeys.org.levels('o1'), ['org', 'o1', 'levels']);
    assert.deepEqual(queryKeys.org.structure('o1', false), ['org', 'o1', 'structure', 'active']);
    assert.deepEqual(queryKeys.org.structure('o1', true), ['org', 'o1', 'structure', 'inactive']);
    assert.deepEqual(queryKeys.org.structureAll('o1'), ['org', 'o1', 'structure']);
  });

  it('org.detail, user.me, admin.meetings, rbac.catalog', () => {
    assert.deepEqual(queryKeys.org.detail('o1'), ['org', 'o1', 'detail']);
    assert.deepEqual(queryKeys.user.me(), ['user', 'me']);
    assert.deepEqual(queryKeys.admin.meetings('o1', 'all'), ['admin', 'meetings', 'o1', 'all']);
    assert.deepEqual(queryKeys.rbac.catalog(), ['rbac', 'catalog']);
    assert.deepEqual(queryKeys.rbac.roleGroups('o1', 'r1'), ['rbac', 'role-groups', 'o1', 'r1']);
  });

  it('projects.list and org.taskWorkspaceScope', () => {
    assert.deepEqual(queryKeys.projects.list('o1', { excludeClosed: true }), [
      'projects',
      'list',
      'o1',
      'excludeClosed',
    ]);
    assert.deepEqual(queryKeys.projects.listAll('o1'), ['projects', 'list', 'o1']);
    assert.deepEqual(queryKeys.org.taskWorkspaceScope('o1'), [
      'org',
      'task-workspace-scope',
      'o1',
    ]);
  });
});
