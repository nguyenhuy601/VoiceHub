const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectCloseSnapshot,
  dedupeReassignmentHistory,
} = require('../src/utils/project/projectCloseSnapshot');

describe('projectCloseSnapshot reassignment / failedShortHorizon (Wave C)', () => {
  it('folds operationalLog into reassignmentHistory and failedShortHorizon', () => {
    const snapshot = buildProjectCloseSnapshot({
      project: {
        title: 'Demo',
        operationalLog: [
          {
            type: 'reassignment',
            source: 'fallback_override',
            taskId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            fromUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            toUserId: 'cccccccccccccccccccccccc',
            at: '2026-08-10T10:00:00.000Z',
            reason: 'pm_override',
          },
          {
            type: 'reassignment',
            source: 'task_reassign',
            taskId: 'dddddddddddddddddddddddd',
            fromUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            toUserId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            at: '2026-08-11T10:00:00.000Z',
          },
          {
            type: 'failed_short_horizon',
            taskId: 'ffffffffffffffffffffffff',
            at: '2026-08-12T10:00:00.000Z',
            fromStatus: 'in_progress',
            toStatus: 'cancelled',
            remainingCalendarDays: 0,
          },
        ],
      },
      closedAt: new Date('2026-08-17T00:00:00.000Z'),
      listsById: {},
      tasks: [],
      worklogs: [],
      activities: [],
    });

    assert.ok(snapshot.process.reassignmentHistory.value);
    assert.equal(snapshot.process.reassignmentHistory.value.length, 2);
    assert.equal(snapshot.process.reassignmentHistory.value[0].source, 'fallback_override');
    assert.equal(snapshot.process.reassignmentHistory.value[1].source, 'task_reassign');

    assert.ok(snapshot.process.failedShortHorizon.value);
    assert.equal(snapshot.process.failedShortHorizon.value.length, 1);
    assert.equal(
      snapshot.process.failedShortHorizon.value[0].taskId,
      'ffffffffffffffffffffffff'
    );
  });

  it('compat: missing operationalLog → unavailable, no throw', () => {
    const snapshot = buildProjectCloseSnapshot({
      project: { title: 'Legacy' },
      closedAt: new Date('2026-08-17T00:00:00.000Z'),
      listsById: {},
      tasks: [],
      worklogs: [],
      activities: [],
    });
    assert.equal(snapshot.process.reassignmentHistory.value, null);
    assert.ok(snapshot.process.reassignmentHistory.unavailableReason);
    assert.equal(snapshot.process.failedShortHorizon.value, null);
    assert.ok(snapshot.process.failedShortHorizon.unavailableReason);
  });

  it('dedupeReassignmentHistory drops duplicate taskId|from|to|at', () => {
    const rows = dedupeReassignmentHistory([
      {
        taskId: 't1',
        fromUserId: 'u1',
        toUserId: 'u2',
        at: '2026-08-10T00:00:00.000Z',
        source: 'task_activity',
      },
      {
        taskId: 't1',
        fromUserId: 'u1',
        toUserId: 'u2',
        at: '2026-08-10T00:00:00.000Z',
        source: 'task_reassign',
      },
      {
        taskId: 't1',
        fromUserId: 'u1',
        toUserId: 'u3',
        at: '2026-08-11T00:00:00.000Z',
        source: 'fallback_override',
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].source, 'task_activity');
    assert.equal(rows[1].toUserId, 'u3');
  });
});
