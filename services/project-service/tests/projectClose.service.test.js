const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  getCompleteProjectPreview,
  completeProject,
} = require('../src/services/projectClose.service');

function createFakeProject({ id = 'p1', status = 'in_development', isActive = true } = {}) {
  return {
    _id: id,
    organizationId: 'org1',
    status,
    isActive,
    startDate: new Date('2026-07-01'),
    expectedEndDate: new Date('2026-08-20'),
    estimatedDurationDays: 40,
    methodologySettings: { wipLimit: 3 },
    budgetStub: null,
    closedAt: null,
    closedBy: null,
    closureSnapshot: null,
    save: async function save() {
      return this;
    },
    toObject: function toObject() {
      return {
        _id: this._id,
        organizationId: this.organizationId,
        status: this.status,
        isActive: this.isActive,
        startDate: this.startDate,
        expectedEndDate: this.expectedEndDate,
        estimatedDurationDays: this.estimatedDurationDays,
        methodologySettings: this.methodologySettings,
        closedAt: this.closedAt,
        closedBy: this.closedBy,
        closureSnapshot: this.closureSnapshot,
      };
    },
  };
}

function chainFind(rows) {
  return {
    select: () => ({
      lean: async () => rows,
    }),
    lean: async () => rows,
  };
}

function createDeps({ projectDoc, sprints = [], tasks = [], lists = [], worklogs = [] }) {
  return {
    Project: {
      findById: async () => projectDoc,
    },
    Sprint: { find: () => chainFind(sprints) },
    Task: { find: () => chainFind(tasks) },
    TaskBoardList: { find: () => chainFind(lists) },
    Worklog: { find: () => chainFind(worklogs) },
    ProjectMember: { find: () => chainFind([]) },
    ChangeRequest: { find: () => chainFind([]) },
    PlanningItem: { find: () => chainFind([]) },
    ApprovalRequest: { find: () => chainFind([]) },
    TaskActivityLog: { find: () => chainFind([]) },
    recordAudit: async () => null,
    assertUserAnyProjectPermission: async () => true,
  };
}

describe('projectClose.service: preview + complete', () => {
  it('T2 complete all-done sets closed, keeps isActive, stores snapshot', async () => {
    const projectDoc = createFakeProject();
    const deps = createDeps({
      projectDoc,
      sprints: [{ _id: 's1', status: 'closed', name: 'S1', closureSnapshot: { completedHours: 5, doneCount: 1, incompleteCount: 0 } }],
      tasks: [{ _id: 't1', status: 'done', listId: 'l1', estimateHours: 5, createdAt: new Date(), completedAt: new Date() }],
      lists: [{ _id: 'l1', statusKey: 'done', title: 'Done' }],
    });

    const res = await completeProject({
      userId: 'u1',
      projectId: 'p1',
      closeNotes: 'Done.',
      deps,
    });

    assert.equal(res.project.status, 'closed');
    assert.equal(res.project.isActive, true);
    assert.ok(res.project.closedAt);
    assert.equal(res.project.closedBy, 'u1');
    assert.equal(res.snapshot.schemaVersion, 1);
    assert.equal(res.snapshot.experience.closeNotes, 'Done.');
    assert.equal(res.snapshot.progress.work.doneCount, 1);
  });

  it('T3 OPEN_SPRINTS does not persist snapshot', async () => {
    const projectDoc = createFakeProject();
    const deps = createDeps({
      projectDoc,
      sprints: [{ _id: 's1', status: 'active', name: 'S1' }],
      tasks: [{ _id: 't1', status: 'done', listId: 'l1' }],
      lists: [{ _id: 'l1', statusKey: 'done', title: 'Done' }],
    });

    await assert.rejects(
      () => completeProject({ userId: 'u1', projectId: 'p1', deps }),
      (err) => err.statusCode === 409 && err.errorCode === 'OPEN_SPRINTS'
    );
    assert.equal(projectDoc.status, 'in_development');
    assert.equal(projectDoc.closureSnapshot, null);
  });

  it('T3 INCOMPLETE_WORK backlog leftover', async () => {
    const projectDoc = createFakeProject();
    const deps = createDeps({
      projectDoc,
      sprints: [{ _id: 's1', status: 'closed', name: 'S1' }],
      tasks: [
        { _id: 't1', status: 'done', listId: 'l1' },
        { _id: 't2', status: 'todo', listId: 'l2', sprintId: null },
      ],
      lists: [
        { _id: 'l1', statusKey: 'done', title: 'Done' },
        { _id: 'l2', statusKey: 'todo', title: 'To Do' },
      ],
    });

    await assert.rejects(
      () => completeProject({ userId: 'u1', projectId: 'p1', deps }),
      (err) => err.errorCode === 'INCOMPLETE_WORK' && err.details.backlogIncompleteCount === 1
    );
  });

  it('T4 complete twice → ALREADY_CLOSED', async () => {
    const projectDoc = createFakeProject({ status: 'closed' });
    const deps = createDeps({ projectDoc, sprints: [], tasks: [] });
    await assert.rejects(
      () => completeProject({ userId: 'u1', projectId: 'p1', deps }),
      (err) => err.errorCode === 'ALREADY_CLOSED'
    );
  });

  it('preview returns snapshot when closeable', async () => {
    const projectDoc = createFakeProject();
    const deps = createDeps({
      projectDoc,
      sprints: [{ _id: 's1', status: 'closed' }],
      tasks: [{ _id: 't1', status: 'done', listId: 'l1' }],
      lists: [{ _id: 'l1', statusKey: 'done', title: 'Done' }],
    });
    const res = await getCompleteProjectPreview({ userId: 'u1', projectId: 'p1', deps });
    assert.equal(res.closeable, true);
    assert.equal(res.snapshot.progress.work.doneCount, 1);
  });
});
