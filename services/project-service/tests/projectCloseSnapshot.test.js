const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProjectCloseSnapshot,
  countReopenFromActivities,
  SNAPSHOT_SCHEMA_VERSION,
} = require('../src/utils/projectCloseSnapshot');

const listsById = {
  l1: { statusKey: 'done', title: 'Done' },
  l2: { statusKey: 'todo', title: 'To Do' },
};

const closedAt = new Date('2026-08-17T00:00:00.000Z');

describe('projectCloseSnapshot: T1 seven groups from fixture', () => {
  const snapshot = buildProjectCloseSnapshot({
    project: {
      startDate: '2026-07-01T00:00:00.000Z',
      expectedEndDate: '2026-08-20T00:00:00.000Z',
      estimatedDurationDays: 50,
      budgetStub: { amount: 1000, currency: 'VND', note: 'stub' },
      methodologySettings: { wipLimit: 5 },
    },
    closedAt,
    closeNotes: 'Ship xong, cần chuẩn hóa estimate.',
    tasks: [
      {
        _id: 't1',
        status: 'done',
        listId: 'l1',
        issueType: 'story',
        estimateHours: 8,
        assigneeId: 'u1',
        dueDate: '2026-08-10T00:00:00.000Z',
        createdAt: '2026-07-02T00:00:00.000Z',
        completedAt: '2026-08-12T00:00:00.000Z',
      },
      {
        _id: 't2',
        status: 'done',
        listId: 'l1',
        issueType: 'bug',
        estimateHours: 2,
        assigneeId: 'u2',
        createdAt: '2026-07-10T00:00:00.000Z',
        completedAt: '2026-07-11T00:00:00.000Z',
      },
      {
        _id: 't3',
        status: 'done',
        listId: 'l1',
        issueType: 'task',
        estimateHours: 4,
        createdAt: '2026-07-05T00:00:00.000Z',
        completedAt: '2026-07-06T00:00:00.000Z',
      },
    ],
    listsById,
    sprints: [
      {
        _id: 's1',
        name: 'Sprint 1',
        status: 'closed',
        startDate: '2026-07-01',
        endDate: '2026-07-14',
        closedAt: '2026-07-14',
        reviewNotes: 'Cần chia nhỏ story.',
        closureSnapshot: {
          committedHours: 10,
          completedHours: 8,
          doneCount: 2,
          incompleteCount: 1,
        },
      },
    ],
    worklogs: [
      { userId: 'u1', hours: 10 },
      { userId: 'u2', hours: 3 },
    ],
    members: [
      { userId: 'u1', status: 'active', joinDate: '2026-07-01', billable: true },
      { userId: 'u2', status: 'active', joinDate: '2026-07-01', billable: false },
    ],
    changeRequests: [{ status: 'approved' }, { status: 'draft' }],
    planningItems: [
      { type: 'milestone', status: 'planned', targetDate: '2026-08-01T00:00:00.000Z' },
      { type: 'epic', status: 'done' },
    ],
    approvals: [
      {
        status: 'approved',
        createdAt: '2026-07-01T00:00:00.000Z',
        completedAt: '2026-07-02T00:00:00.000Z',
      },
    ],
    activities: [
      { payload: { fromStatus: 'done', toStatus: 'todo' } },
    ],
  });

  it('sets schemaVersion and actualEnd', () => {
    assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snapshot.progress.actualEnd, closedAt.toISOString());
    assert.equal(snapshot.progress.onTime, true);
    assert.equal(snapshot.progress.scheduleVarianceDays, -3);
  });

  it('progress work + overdue + delayed milestone + CR counts', () => {
    assert.equal(snapshot.progress.work.total, 3);
    assert.equal(snapshot.progress.work.doneCount, 3);
    assert.equal(snapshot.progress.work.overdueCompletedCount, 1);
    assert.equal(snapshot.progress.planning.delayedMilestoneCount, 1);
    assert.equal(snapshot.progress.changeRequests.byStatus.approved, 1);
    assert.equal(snapshot.progress.changeRequests.total, 2);
  });

  it('performance velocity / throughput / lead time; cycle time unavailable', () => {
    assert.equal(snapshot.performance.velocityHoursAverage, 8);
    assert.equal(snapshot.performance.throughput.totalDone, 3);
    assert.equal(snapshot.performance.byIssueType.bug.count, 1);
    assert.ok(snapshot.performance.leadTimeHours.average > 0);
    assert.equal(snapshot.performance.cycleTimeHours.value, null);
    assert.equal(snapshot.performance.cycleTimeHours.unavailableReason, 'missing_firstInProgressAt');
  });

  it('quality defect rate + reopen; escaped/severity null', () => {
    assert.equal(snapshot.quality.bugCount, 1);
    assert.equal(snapshot.quality.defectRate, 0.333);
    assert.equal(snapshot.quality.reopenCount, 1);
    assert.equal(snapshot.quality.escapedBugs.value, null);
    assert.equal(snapshot.quality.severity.value, null);
  });

  it('resources planned vs actual hours; cost unavailable', () => {
    assert.equal(snapshot.resources.plannedHours, 14);
    assert.equal(snapshot.resources.actualHours, 13);
    assert.equal(snapshot.resources.varianceHours, -1);
    assert.equal(snapshot.resources.budgetStub.amount, 1000);
    assert.equal(snapshot.resources.actualCost.value, null);
  });

  it('personnel per member + unassigned done', () => {
    assert.equal(snapshot.personnel.unassignedDoneCount, 1);
    const u1 = snapshot.personnel.members.find((m) => m.userId === 'u1');
    assert.equal(u1.tasksDone, 1);
    assert.equal(u1.hoursLogged, 10);
  });

  it('process approval wait + spillover; blocker fields unavailable', () => {
    assert.equal(snapshot.process.approvalWaitHoursAverage, 24);
    assert.equal(snapshot.process.historicalSpilloverCount, 1);
    assert.equal(snapshot.process.wipLimit, 5);
    assert.equal(snapshot.process.blockers.value, null);
    assert.equal(snapshot.process.dependency.value, null);
    assert.equal(snapshot.process.bottleneck.value, null);
  });

  it('experience closeNotes + sprint review notes', () => {
    assert.equal(snapshot.experience.closeNotes, 'Ship xong, cần chuẩn hóa estimate.');
    assert.equal(snapshot.experience.sprintReviewNotes.length, 1);
    assert.equal(snapshot.experience.sprintReviewNotes[0].reviewNotes, 'Cần chia nhỏ story.');
  });
});

describe('projectCloseSnapshot: reopen from activities', () => {
  it('null when activities not loaded', () => {
    const res = countReopenFromActivities(undefined);
    assert.equal(res.value, null);
    assert.equal(res.unavailableReason, 'activity_not_loaded');
  });

  it('null when payload has no from/to status', () => {
    const res = countReopenFromActivities([{ payload: { fields: ['title'] } }]);
    assert.equal(res.value, null);
    assert.equal(res.unavailableReason, 'activity_payload_lacks_status_transition');
  });
});
