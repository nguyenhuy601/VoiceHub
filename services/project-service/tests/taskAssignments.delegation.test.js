const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  syncPrimaryAssignment,
  primaryFromAssignments,
  normalizeAssignmentsPayload,
} = require('../src/utils/taskAssignments');
const { edgeMatchesTaskType } = require('../src/services/delegation.service');

describe('taskAssignments dual-write', () => {
  it('syncs primary from assigneeId', () => {
    const synced = syncPrimaryAssignment('u1', [{ userId: 'u2', slot: 'watcher' }]);
    assert.equal(String(synced.assigneeId), 'u1');
    assert.equal(synced.assignments.filter((a) => a.slot === 'primary').length, 1);
    assert.equal(synced.assignments.some((a) => a.slot === 'watcher'), true);
  });

  it('clears primary when assignee null', () => {
    const synced = syncPrimaryAssignment(null, [
      { userId: 'u1', slot: 'primary' },
      { userId: 'u2', slot: 'reviewer' },
    ]);
    assert.equal(synced.assigneeId, null);
    assert.equal(synced.assignments.some((a) => a.slot === 'primary'), false);
    assert.equal(synced.assignments.length, 1);
  });

  it('primaryFromAssignments', () => {
    assert.equal(
      String(primaryFromAssignments([{ userId: 'x', slot: 'primary' }])),
      'x'
    );
  });

  it('normalizeAssignmentsPayload filters', () => {
    const rows = normalizeAssignmentsPayload([
      { userId: 'a', slot: 'qa_owner' },
      { slot: 'primary' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slot, 'qa_owner');
  });
});

describe('delegation edgeMatchesTaskType', () => {
  it('wildcard matches all', () => {
    assert.equal(edgeMatchesTaskType({ taskTypes: ['*'] }, 'bug'), true);
    assert.equal(edgeMatchesTaskType({ taskTypes: [] }, 'bug'), true);
  });

  it('specific type', () => {
    assert.equal(edgeMatchesTaskType({ taskTypes: ['bug'] }, 'bug'), true);
    assert.equal(edgeMatchesTaskType({ taskTypes: ['bug'] }, 'tech'), false);
  });
});
