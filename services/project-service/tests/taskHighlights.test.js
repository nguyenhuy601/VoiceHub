const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pickTaskHighlights,
  buildClosedBoardExperiences,
  TASK_HIGHLIGHTS_MAX,
} = require('../src/utils/project/boardCloseExperience');

describe('taskHighlights Wave B', () => {
  const byTask = [
    {
      taskId: 't1',
      title: 'Early ship',
      assignedUserId: 'u1',
      tags: ['React'],
      submittedEarlyHours: 4,
      reopenCount: 0,
      actualHours: 4,
      completedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      taskId: 't2',
      title: 'Reopened mess',
      assignedUserId: 'u1',
      tags: ['Node.js'],
      submittedEarlyHours: 5,
      reopenCount: 3,
      actualHours: 10,
      completedAt: '2026-08-02T00:00:00.000Z',
    },
    {
      taskId: 't3',
      title: 'Solid mid',
      assignedUserId: 'u1',
      tags: ['MongoDB'],
      submittedEarlyHours: 2,
      reopenCount: 0,
      actualHours: 8,
      completedAt: '2026-08-03T00:00:00.000Z',
    },
    {
      taskId: 't4',
      title: 'Other user',
      assignedUserId: 'u2',
      tags: ['Go'],
      submittedEarlyHours: 9,
      reopenCount: 0,
      actualHours: 1,
      completedAt: '2026-08-04T00:00:00.000Z',
    },
    {
      taskId: 't5',
      title: 'Incomplete',
      assignedUserId: 'u1',
      tags: ['Vue'],
      submittedEarlyHours: 10,
      reopenCount: 0,
      actualHours: 0,
      completedAt: null,
    },
  ];

  it('ranks by early - 2*reopen and caps at 5', () => {
    const rows = pickTaskHighlights(byTask, 'u1');
    assert.ok(rows.length <= TASK_HIGHLIGHTS_MAX);
    assert.equal(rows[0].taskId, 't1'); // score 4
    assert.equal(rows[1].taskId, 't3'); // score 2
    assert.equal(rows[2].taskId, 't2'); // score 5-6 = -1
    assert.ok(!rows.some((r) => r.taskId === 't5'));
    assert.ok(!rows.some((r) => r.taskId === 't4'));
  });

  it('attaches taskHighlights on closed-board experience row', () => {
    const out = buildClosedBoardExperiences({
      board: { _id: 'b1', title: 'Proj', dueDate: '2026-08-01', startDate: '2026-07-01' },
      memberships: [{ userId: 'u1', projectRoleId: 'r1' }],
      roles: [{ _id: 'r1', key: 'developer', label: 'Developer' }],
      tasks: [
        { assigneeId: 'u1', status: 'done', completedAt: '2026-08-01' },
      ],
      byTaskRows: byTask,
    });
    assert.equal(out.length, 1);
    assert.ok(Array.isArray(out[0].taskHighlights));
    assert.equal(out[0].taskHighlights[0].title, 'Early ship');
  });

  it('E4 caps taskHighlights at 5 when more than 5 completed candidates', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      taskId: `x${i}`,
      title: `Task ${i}`,
      assignedUserId: 'u1',
      tags: [`tag${i}`],
      submittedEarlyHours: 10 - i,
      reopenCount: 0,
      actualHours: 2,
      completedAt: `2026-08-0${(i % 9) + 1}T00:00:00.000Z`,
    }));
    const rows = pickTaskHighlights(many, 'u1');
    assert.equal(rows.length, TASK_HIGHLIGHTS_MAX);
    assert.equal(TASK_HIGHLIGHTS_MAX, 5);
  });
});
