const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUserPerformanceRollup,
  estimationAccuracyPct,
} = require('@enterprise/shared/analytics/performanceMetrics');

describe('report-service performance rollup helpers', () => {
  it('builds warehouse-shaped document', () => {
    const rollup = buildUserPerformanceRollup({
      organizationId: 'org',
      userId: 'u1',
      windowDays: 90,
      completedTasks: [
        { estimateHours: 40, actualHours: 45, issueType: 'task', completedAt: new Date() },
      ],
    });
    assert.equal(estimationAccuracyPct(40, 45), 89);
    assert.equal(rollup.organizationId, 'org');
    assert.equal(rollup.confidence, 'low');
    assert.ok(rollup.estimation);
  });
});
