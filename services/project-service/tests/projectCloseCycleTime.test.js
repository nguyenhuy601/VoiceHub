const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectCloseSnapshot,
} = require('../src/utils/projectCloseSnapshot');

describe('projectCloseSnapshot cycle time with firstInProgressAt', () => {
  it('computes cycle time when firstInProgressAt present', () => {
    const snapshot = buildProjectCloseSnapshot({
      project: {},
      closedAt: '2026-08-17T00:00:00.000Z',
      tasks: [
        {
          _id: 't1',
          status: 'done',
          listId: 'l1',
          issueType: 'task',
          estimateHours: 8,
          createdAt: '2026-08-01T00:00:00.000Z',
          firstInProgressAt: '2026-08-10T00:00:00.000Z',
          completedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      listsById: { l1: { statusKey: 'done' } },
      sprints: [],
      worklogs: [],
      members: [],
      activities: [],
    });
    assert.equal(snapshot.performance.cycleTimeHours.unavailableReason, null);
    assert.equal(snapshot.performance.cycleTimeHours.sampleSize, 1);
    assert.equal(snapshot.performance.cycleTimeHours.average, 48);
  });
});
