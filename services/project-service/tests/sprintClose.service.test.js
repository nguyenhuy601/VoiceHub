const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { completeSprint, getCompleteSprintPreview } = require('../src/services/sprintClose.service');

function createFakeSprint({ id, projectId, status = 'active', organizationId = 'org1' }) {
  return {
    _id: id,
    projectId,
    organizationId,
    status,
    closedAt: null,
    closedBy: null,
    closureSnapshot: null,
    save: async function save() {
      return this;
    },
    toObject: function toObject() {
      return {
        _id: this._id,
        projectId: this.projectId,
        organizationId: this.organizationId,
        status: this.status,
        closedAt: this.closedAt,
        closedBy: this.closedBy,
        closureSnapshot: this.closureSnapshot,
      };
    },
  };
}

function createDeps({ sprintDoc, targetSprintDoc, tasks, listsById, destinationSprints }) {
  const calls = { updateMany: [] };
  const dest =
    destinationSprints !== undefined
      ? destinationSprints
      : targetSprintDoc
        ? [targetSprintDoc]
        : [];

  const Sprint = {
    findOne: (q) => {
      const isSelf = String(q._id) === String(sprintDoc._id);
      const doc = isSelf ? sprintDoc : targetSprintDoc;
      if (!doc) {
        return { lean: async () => null };
      }
      return {
        ...doc,
        lean: async () => doc,
      };
    },
    find: (q) => {
      const shouldExcludeSelf = q && q._id && q._id.$ne;
      const out = shouldExcludeSelf ? dest.filter(Boolean) : [];
      return {
        select: () => ({
          lean: async () => out,
        }),
        lean: async () => out,
      };
    },
  };

  const Task = {
    find: () => ({
      select: () => ({
        lean: async () => tasks,
      }),
    }),
    updateMany: async (filter, update) => {
      calls.updateMany.push({ filter, update });
      return { modifiedCount: 1 };
    },
  };

  const TaskBoardList = {
    find: () => {
      const out = [];
      for (const [id, meta] of Object.entries(listsById || {})) {
        out.push({ _id: id, ...meta });
      }
      return {
        select: () => ({
          lean: async () => out,
        }),
        lean: async () => out,
      };
    },
  };

  return {
    deps: {
      Sprint,
      Task,
      TaskBoardList,
      recordAudit: async () => null,
      assertUserAnyProjectPermission: async () => true,
      Project: {
        findById: async () => ({ status: 'in_development', isActive: true }),
      },
    },
    calls,
  };
}

describe('sprintClose.service: preview + complete', () => {
  it('preview returns correct done/incomplete counts and hours', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const targetSprintDoc = createFakeSprint({ id: 's2', projectId: 'p1' });

    const tasks = [
      { _id: 't1', status: 'done', listId: 'l1', estimateHours: 5 },
      { _id: 't2', status: 'todo', listId: 'l2', estimateHours: 3 },
    ];
    const listsById = {
      l1: { statusKey: 'done', title: 'Done' },
      l2: { statusKey: 'todo', title: 'To Do' },
    };

    const { deps } = createDeps({ sprintDoc, targetSprintDoc, tasks, listsById });
    const res = await getCompleteSprintPreview({
      userId: 'u1',
      projectId: 'p1',
      sprintId: 's1',
      deps,
    });

    assert.equal(res.doneCount, 1);
    assert.equal(res.incompleteCount, 1);
    assert.equal(res.committedHours, 8);
    assert.equal(res.completedHours, 5);
    assert.equal(res.incompleteHours, 3);
    assert.deepEqual(res.incompleteIssueIds, ['t2']);
    assert.equal(res.isLastSprint, false);
    assert.equal(res.destinationSprints.length, 1);
  });

  it('T7 complete sprint when project closed → PROJECT_CLOSED', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const { deps } = createDeps({
      sprintDoc,
      tasks: [{ _id: 't1', status: 'done', listId: 'l1', estimateHours: 1 }],
      listsById: { l1: { statusKey: 'done', title: 'Done' } },
    });
    deps.Project = { findById: async () => ({ status: 'closed' }) };
    await assert.rejects(
      () => completeSprint({ userId: 'u1', projectId: 'p1', sprintId: 's1', deps }),
      (err) => err.errorCode === 'PROJECT_CLOSED'
    );
  });

  it('complete all-done closes sprint and does not updateMany', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const targetSprintDoc = createFakeSprint({ id: 's2', projectId: 'p1' });

    const tasks = [
      { _id: 't1', status: 'done', listId: 'l1', estimateHours: 2 },
      { _id: 't2', status: 'done', listId: 'l1', estimateHours: 4 },
    ];
    const listsById = { l1: { statusKey: 'done', title: 'Done' } };

    const { deps, calls } = createDeps({ sprintDoc, targetSprintDoc, tasks, listsById });
    const res = await completeSprint({
      userId: 'u1',
      projectId: 'p1',
      sprintId: 's1',
      deps,
    });

    assert.equal(res.sprint.status, 'closed');
    assert.equal(res.report.velocityHours, 6);
    assert.equal(res.report.incompleteMoved, 0);
    assert.equal(calls.updateMany.length, 0);
    assert.equal(res.sprint.closureSnapshot.incompleteCount, 0);
  });

  it('complete incomplete→backlog updates sprintId=null for incomplete tasks', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const targetSprintDoc = createFakeSprint({ id: 's2', projectId: 'p1' });

    const tasks = [
      { _id: 't1', status: 'done', listId: 'l1', estimateHours: 2 },
      { _id: 't2', status: 'todo', listId: 'l2', estimateHours: 3 },
    ];
    const listsById = {
      l1: { statusKey: 'done', title: 'Done' },
      l2: { statusKey: 'todo', title: 'To Do' },
    };

    const { deps, calls } = createDeps({ sprintDoc, targetSprintDoc, tasks, listsById });
    const res = await completeSprint({
      userId: 'u1',
      projectId: 'p1',
      sprintId: 's1',
      incompleteAction: 'backlog',
      deps,
    });

    assert.equal(res.sprint.status, 'closed');
    assert.equal(res.report.velocityHours, 2);
    assert.equal(calls.updateMany.length, 1);
    assert.equal(calls.updateMany[0].update.$set.sprintId, null);
    assert.deepEqual(res.sprint.closureSnapshot.incompleteIssueIds, ['t2']);
  });

  it('complete incomplete→sprint moves incomplete tasks to target sprint', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const targetSprintDoc = createFakeSprint({ id: 's2', projectId: 'p1' });

    const tasks = [
      { _id: 't1', status: 'done', listId: 'l1', estimateHours: 1 },
      { _id: 't2', status: 'todo', listId: 'l2', estimateHours: 3 },
    ];
    const listsById = {
      l1: { statusKey: 'done', title: 'Done' },
      l2: { statusKey: 'todo', title: 'To Do' },
    };

    const { deps, calls } = createDeps({ sprintDoc, targetSprintDoc, tasks, listsById });
    const res = await completeSprint({
      userId: 'u1',
      projectId: 'p1',
      sprintId: 's1',
      incompleteAction: 'sprint',
      targetSprintId: 's2',
      deps,
    });

    assert.equal(res.sprint.status, 'closed');
    assert.equal(res.report.velocityHours, 1);
    assert.equal(calls.updateMany.length, 1);
    assert.equal(calls.updateMany[0].update.$set.sprintId, 's2');
    assert.equal(res.sprint.closureSnapshot.targetSprintId, 's2');
    assert.deepEqual(res.sprint.closureSnapshot.incompleteIssueIds, ['t2']);
  });

  it('throws 400 when incompleteAction missing but sprint has incomplete tasks', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const targetSprintDoc = createFakeSprint({ id: 's2', projectId: 'p1' });

    const tasks = [{ _id: 't2', status: 'todo', listId: 'l2', estimateHours: 3 }];
    const listsById = { l2: { statusKey: 'todo', title: 'To Do' } };

    const { deps } = createDeps({ sprintDoc, targetSprintDoc, tasks, listsById });
    await assert.rejects(
      completeSprint({
        userId: 'u1',
        projectId: 'p1',
        sprintId: 's1',
        deps,
      }),
      (err) => err.statusCode === 400
    );
  });

  it('throws 403 when permission check fails', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const targetSprintDoc = createFakeSprint({ id: 's2', projectId: 'p1' });
    const tasks = [];
    const listsById = {};

    const { deps } = createDeps({ sprintDoc, targetSprintDoc, tasks, listsById });
    deps.assertUserAnyProjectPermission = async () => {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    };

    await assert.rejects(
      completeSprint({
        userId: 'u1',
        projectId: 'p1',
        sprintId: 's1',
        deps,
      }),
      (err) => err.statusCode === 403
    );
  });

  it('T3 last sprint with incomplete throws 409 and does not updateMany', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const tasks = [{ _id: 't2', status: 'todo', listId: 'l2', estimateHours: 3 }];
    const listsById = { l2: { statusKey: 'todo', title: 'To Do' } };

    const { deps, calls } = createDeps({
      sprintDoc,
      targetSprintDoc: null,
      destinationSprints: [],
      tasks,
      listsById,
    });

    await assert.rejects(
      completeSprint({
        userId: 'u1',
        projectId: 'p1',
        sprintId: 's1',
        incompleteAction: 'backlog',
        deps,
      }),
      (err) =>
        err.statusCode === 409 &&
        err.errorCode === 'LAST_SPRINT_HAS_INCOMPLETE' &&
        sprintDoc.status === 'active' &&
        calls.updateMany.length === 0
    );
  });

  it('T4 last sprint all-done closes without incompleteAction', async () => {
    const sprintDoc = createFakeSprint({ id: 's1', projectId: 'p1' });
    const tasks = [{ _id: 't1', status: 'done', listId: 'l1', estimateHours: 2 }];
    const listsById = { l1: { statusKey: 'done', title: 'Done' } };

    const { deps, calls } = createDeps({
      sprintDoc,
      targetSprintDoc: null,
      destinationSprints: [],
      tasks,
      listsById,
    });
    const preview = await getCompleteSprintPreview({
      userId: 'u1',
      projectId: 'p1',
      sprintId: 's1',
      deps,
    });
    assert.equal(preview.isLastSprint, true);
    assert.equal(preview.incompleteCount, 0);

    const res = await completeSprint({
      userId: 'u1',
      projectId: 'p1',
      sprintId: 's1',
      deps,
    });
    assert.equal(res.sprint.status, 'closed');
    assert.equal(calls.updateMany.length, 0);
  });
});

