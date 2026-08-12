const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIssueType,
  createPermissionForIssueType,
  updatePermissionForIssueType,
  planningWritePermission,
} = require('../src/utils/projectIssueTypePerms');

describe('projectIssueTypePerms', () => {
  it('addCard story/bug/task/sub-task map to create keys', () => {
    assert.equal(createPermissionForIssueType('story'), 'story:create');
    assert.equal(createPermissionForIssueType('bug'), 'bug:create');
    assert.equal(createPermissionForIssueType('task'), 'task:create');
    assert.equal(createPermissionForIssueType(undefined), 'task:create');
    assert.equal(createPermissionForIssueType('story', { parentTaskId: 'x' }), 'task:create');
  });

  it('planning epic vs feature write keys', () => {
    assert.equal(planningWritePermission('epic', 'create'), 'epic:create');
    assert.equal(planningWritePermission('epic', 'delete'), 'epic:delete');
    assert.equal(planningWritePermission('epic', 'update'), 'epic:update');
    assert.equal(planningWritePermission('feature', 'create'), 'backlog:update');
    assert.equal(planningWritePermission('roadmap', 'update'), 'backlog:update');
  });

  it('story update vs task update', () => {
    assert.equal(updatePermissionForIssueType('story'), 'story:update');
    assert.equal(updatePermissionForIssueType('bug'), 'task:update');
    assert.equal(updatePermissionForIssueType('task'), 'task:update');
  });

  it('normalizeIssueType giữ story/bug/task, còn lại → task', () => {
    assert.equal(normalizeIssueType('bug'), 'bug');
    assert.equal(normalizeIssueType('Story'), 'story');
    assert.equal(normalizeIssueType(''), 'task');
    assert.equal(normalizeIssueType('epic'), 'task');
  });
});
