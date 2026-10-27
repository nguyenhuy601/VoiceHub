const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectCloseSnapshot,
  buildByTask,
  BY_TASK_CAP,
} = require('../src/utils/project/projectCloseSnapshot');

const listsById = {
  l1: { statusKey: 'done', title: 'Done' },
  l2: { statusKey: 'todo', title: 'To Do' },
};

describe('projectCloseSnapshot resources.byTask (Wave A)', () => {
  it('aggregates planned/actual/early/overdue/reopen per task', () => {
    const snapshot = buildProjectCloseSnapshot({
      project: { title: 'Demo' },
      closedAt: new Date('2026-08-17T00:00:00.000Z'),
      listsById,
      tasks: [
        {
          _id: 't1',
          title: 'API Auth',
          description: 'Implement JWT gateway trust',
          status: 'done',
          listId: 'l1',
          estimateHours: 8,
          assigneeId: 'u1',
          tags: ['Node.js', 'JWT'],
          completedAt: '2026-08-10T00:00:00.000Z',
        },
        {
          _id: 't2',
          title: 'UI Board',
          status: 'done',
          listId: 'l1',
          estimateHours: 4,
          assigneeId: 'u2',
          tags: ['React'],
          completedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      worklogs: [
        { taskId: 't1', userId: 'u1', hours: 6 },
        { taskId: 't2', userId: 'u2', hours: 5 },
      ],
      activities: [
        {
          taskId: 't1',
          payload: { changes: [{ field: 'status', from: 'done', to: 'todo' }] },
        },
      ],
    });

    assert.ok(Array.isArray(snapshot.resources.byTask));
    assert.equal(snapshot.resources.byTask.length, 2);
    const t1 = snapshot.resources.byTask.find((r) => r.taskId === 't1');
    assert.ok(t1);
    assert.equal(t1.title, 'API Auth');
    assert.equal(t1.assignedUserId, 'u1');
    assert.equal(t1.plannedHours, 8);
    assert.equal(t1.actualHours, 6);
    assert.equal(t1.submittedEarlyHours, 2);
    assert.equal(t1.overdueHours, 0);
    assert.equal(t1.reopenCount, 1);
    assert.ok(t1.tags.includes('Node.js'));
    assert.equal(t1.descriptionSnippet, 'Implement JWT gateway trust');
    assert.ok(t1.completedAt);

    const t2 = snapshot.resources.byTask.find((r) => r.taskId === 't2');
    assert.equal(t2.submittedEarlyHours, 0);
    assert.equal(t2.overdueHours, 1);
    assert.equal(t2.reopenCount, 0);
  });

  it('compat: empty tasks → byTask [] without throw', () => {
    const rows = buildByTask({ tasks: [], worklogs: [], activities: [], listsById: {} });
    assert.deepEqual(rows, []);
  });

  it('E1 compat: reader treats missing byTask as [] without throw', () => {
    const legacyResources = { byUser: [] };
    const byTask = Array.isArray(legacyResources.byTask) ? legacyResources.byTask : [];
    assert.deepEqual(byTask, []);
    assert.doesNotThrow(() => {
      for (const row of byTask) {
        void row.taskId;
      }
    });
  });

  it('E2 caps byTask at BY_TASK_CAP (500)', () => {
    const tasks = Array.from({ length: BY_TASK_CAP + 50 }, (_, i) => ({
      _id: `t${i}`,
      title: `T${i}`,
      estimateHours: 1,
      assigneeId: i % 2 === 0 ? 'u1' : null,
      tags: [],
      completedAt: i < 10 ? '2026-08-01T00:00:00.000Z' : null,
    }));
    const rows = buildByTask({
      tasks,
      worklogs: [{ taskId: 't0', userId: 'u1', hours: 1 }],
      activities: [],
      listsById: {},
    });
    assert.equal(rows.length, BY_TASK_CAP);
  });

  it('E3 descriptionSnippet ≤180; omit empty/ciphertext', () => {
    const long = 'x'.repeat(250);
    const [withLong] = buildByTask({
      tasks: [{ _id: 'a', title: 'A', description: long, estimateHours: 1 }],
      worklogs: [],
      activities: [],
      listsById: {},
    });
    assert.ok(withLong.descriptionSnippet);
    assert.ok(withLong.descriptionSnippet.length <= 180);

    const [emptyDesc] = buildByTask({
      tasks: [{ _id: 'b', title: 'B', description: '   ', estimateHours: 1 }],
      worklogs: [],
      activities: [],
      listsById: {},
    });
    assert.equal(emptyDesc.descriptionSnippet, undefined);

    const [binary] = buildByTask({
      tasks: [{ _id: 'c', title: 'C', description: `secret\u0000payload`, estimateHours: 1 }],
      worklogs: [],
      activities: [],
      listsById: {},
    });
    assert.equal(binary.descriptionSnippet, undefined);
  });
});
