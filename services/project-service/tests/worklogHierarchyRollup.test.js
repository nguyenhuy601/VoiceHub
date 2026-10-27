const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildHierarchyActualRollup,
  submittedEarlyHours,
} = require('../src/utils/task/timeTracking');

describe('worklog hierarchy aggregate-on-read (T3)', () => {
  it('submittedEarlyHours = max(0, estimate - actual)', () => {
    assert.equal(submittedEarlyHours(10, 6), 4);
    assert.equal(submittedEarlyHours(10, 12), 0);
    assert.equal(submittedEarlyHours(null, 5), null);
  });

  it('rolls child worklogs into story parent', () => {
    const tasks = [
      { _id: 'story1', issueType: 'story', estimateHours: 20, epicId: 'epicA' },
      { _id: 't1', parentTaskId: 'story1', estimateHours: 8, epicId: 'epicA' },
      { _id: 't2', parentTaskId: 'story1', estimateHours: 6, epicId: 'epicA' },
      { _id: 'orphan', estimateHours: 3, epicId: 'epicB' },
    ];
    const logs = [
      { taskId: 'story1', hours: 1 },
      { taskId: 't1', hours: 5 },
      { taskId: 't2', hours: 4 },
      { taskId: 'orphan', hours: 2 },
    ];
    const { byParent, byEpic } = buildHierarchyActualRollup(tasks, logs);
    assert.equal(byParent.story1.ownActualHours, 1);
    assert.equal(byParent.story1.rolledActualHours, 10);
    assert.equal(byParent.story1.descendantCount, 2);
    assert.equal(byParent.story1.submittedEarlyHours, 10);
    assert.equal(byParent.t1.rolledActualHours, 5);
    assert.equal(byEpic.epicA.rolledActualHours, 10);
    assert.equal(byEpic.epicA.taskCount, 3);
    assert.equal(byEpic.epicB.rolledActualHours, 2);
  });

  it('handles nested parentTaskId chain', () => {
    const tasks = [
      { _id: 'root', estimateHours: 30 },
      { _id: 'mid', parentTaskId: 'root' },
      { _id: 'leaf', parentTaskId: 'mid' },
    ];
    const logs = [
      { taskId: 'leaf', hours: 7 },
      { taskId: 'mid', hours: 2 },
    ];
    const { byParent } = buildHierarchyActualRollup(tasks, logs);
    assert.equal(byParent.root.rolledActualHours, 9);
    assert.equal(byParent.mid.rolledActualHours, 9);
    assert.equal(byParent.leaf.rolledActualHours, 7);
  });
});
