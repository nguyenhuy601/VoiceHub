const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySprintClosureTasks,
  isDoneFromTask,
  isDoneListTitle,
} = require('../src/utils/sprintCloseClassify');

describe('sprintCloseClassify: list title heuristic', () => {
  it('detects done-like titles/statusKeys', () => {
    assert.equal(isDoneListTitle('Done'), true);
    assert.equal(isDoneListTitle('completed'), true);
    assert.equal(isDoneListTitle('Xong'), true);
    assert.equal(isDoneListTitle('Hoàn thành'), true);
    assert.equal(isDoneListTitle('in progress'), false);
  });
});

describe('sprintCloseClassify: task classification + hours', () => {
  const listsById = {
    'l1': { _id: 'l1', statusKey: 'done', title: 'Done' },
    'l2': { _id: 'l2', statusKey: 'todo', title: 'To Do' },
    'l3': { _id: 'l3', statusKey: 'review', title: 'In Review' },
    'l4': { _id: 'l4', statusKey: 'complete', title: 'Complete sprint' },
  };

  it('classifies done by task.status=done', () => {
    const res = classifySprintClosureTasks({
      tasks: [
        { _id: 't1', status: 'done', listId: 'l2', estimateHours: 5 },
        { _id: 't2', status: 'todo', listId: 'l2', estimateHours: 3 },
      ],
      listsById,
    });
    assert.deepEqual(res.doneTaskIds, ['t1']);
    assert.deepEqual(res.incompleteTaskIds, ['t2']);
    assert.equal(res.doneCount, 1);
    assert.equal(res.incompleteCount, 1);
    assert.equal(res.committedHours, 8);
    assert.equal(res.completedHours, 5);
    assert.equal(res.incompleteHours, 3);
  });

  it('classifies done by list statusKey/title even if task.status is not done', () => {
    const res = classifySprintClosureTasks({
      tasks: [
        { _id: 't1', status: 'todo', listId: 'l1', estimateHours: 2 },
        { _id: 't2', status: 'todo', listId: 'l4', estimateHours: 4 },
        { _id: 't3', status: 'todo', listId: 'l2', estimateHours: 1 },
      ],
      listsById,
    });
    assert.deepEqual(res.doneTaskIds.sort(), ['t1', 't2']);
    assert.deepEqual(res.incompleteTaskIds, ['t3']);
    assert.equal(res.completedHours, 6);
    assert.equal(res.incompleteHours, 1);
  });

  it('treats non-finite estimateHours as 0', () => {
    const res = classifySprintClosureTasks({
      tasks: [{ _id: 't1', status: 'done', listId: 'l1', estimateHours: null }],
      listsById,
    });
    assert.deepEqual(res.doneTaskIds, ['t1']);
    assert.equal(res.committedHours, 0);
    assert.equal(res.completedHours, 0);
    assert.equal(res.incompleteHours, 0);
  });
});

