const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildHistoryMetricsFromEmployees,
  buildHistoryMetricsFromSnapshot,
} = require('../src/utils/aiAnalysis/pipeline/buildHistoryMetrics');

describe('buildHistoryMetrics (HARD-03)', () => {
  it('empty history → sampleSize 0 and empty hours (no invent)', () => {
    const empty = buildHistoryMetricsFromEmployees([]);
    assert.equal(empty.sampleSize, 0);
    assert.deepEqual(empty.hoursByComplexity, {});

    const noHours = buildHistoryMetricsFromEmployees([
      { userId: 'u1', history: [{ role: 'backend', domain: 'fintech' }] },
    ]);
    assert.equal(noHours.sampleSize, 0);
    assert.deepEqual(noHours.hoursByComplexity, {});
  });

  it('aggregates real complexity/hours from employees', () => {
    const metrics = buildHistoryMetricsFromEmployees([
      {
        userId: 'u1',
        history: [
          { complexity: 'low', hours: 6 },
          { complexity: 'low', hours: 10 },
          { complexity: 'high', effortHours: 40 },
        ],
      },
      {
        userId: 'u2',
        capability: {
          projectExperiences: [{ complexity: 'medium', actualHours: 20 }],
        },
      },
    ]);
    assert.equal(metrics.sampleSize, 4);
    assert.equal(metrics.hoursByComplexity.low, 8);
    assert.equal(metrics.hoursByComplexity.medium, 20);
    assert.equal(metrics.hoursByComplexity.high, 40);
  });

  it('reads employees from snapshot paths', () => {
    const fromSnap = buildHistoryMetricsFromSnapshot({
      commonFiltered: {
        employees: [{ history: [{ complexity: 'medium', hours: 16 }] }],
      },
    });
    assert.equal(fromSnap.sampleSize, 1);
    assert.equal(fromSnap.hoursByComplexity.medium, 16);

    assert.equal(buildHistoryMetricsFromSnapshot(null).sampleSize, 0);
  });
});
