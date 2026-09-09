const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  estimationAccuracyPct,
  estimationBiasHours,
  confidenceFromSampleSize,
  calibrateEstimateHours,
  buildUserPerformanceRollup,
} = require('../analytics/performanceMetrics');

describe('performanceMetrics', () => {
  it('T1: accuracy 40 vs 45 = 89%', () => {
    assert.equal(estimationAccuracyPct(40, 45), 89);
    assert.equal(estimationBiasHours(40, 45), 5);
  });

  it('accuracy null when estimate missing', () => {
    assert.equal(estimationAccuracyPct(null, 5), null);
    assert.equal(estimationAccuracyPct(0, 5), null);
  });

  it('confidence tiers', () => {
    assert.equal(confidenceFromSampleSize(0), 'low');
    assert.equal(confidenceFromSampleSize(4), 'low');
    assert.equal(confidenceFromSampleSize(5), 'medium');
    assert.equal(confidenceFromSampleSize(15), 'high');
  });

  it('calibrateEstimateHours applies bias when medium+', () => {
    const r = calibrateEstimateHours({
      baselineHours: 40,
      avgEstimateHours: 40,
      avgActualHours: 45,
      confidence: 'medium',
    });
    assert.equal(r.applied, true);
    assert.equal(r.suggestedHours, 45);
    assert.equal(r.multiplier, 1.13);
  });

  it('T7: cold start does not apply bias', () => {
    const r = calibrateEstimateHours({
      baselineHours: 40,
      avgEstimateHours: 40,
      avgActualHours: 45,
      confidence: 'low',
    });
    assert.equal(r.applied, false);
    assert.equal(r.suggestedHours, 40);
    assert.equal(r.reason, 'insufficient_confidence');
  });

  it('buildUserPerformanceRollup aggregates estimation + quality', () => {
    const rollup = buildUserPerformanceRollup({
      organizationId: 'org1',
      userId: 'u1',
      windowDays: 90,
      asOf: '2026-08-20T00:00:00.000Z',
      completedTasks: [
        {
          estimateHours: 40,
          actualHours: 45,
          issueType: 'task',
          completedAt: '2026-08-10T00:00:00.000Z',
          firstInProgressAt: '2026-08-08T00:00:00.000Z',
        },
        {
          estimateHours: 8,
          actualHours: 8,
          issueType: 'bug',
          completedAt: '2026-08-12T00:00:00.000Z',
          firstInProgressAt: '2026-08-11T00:00:00.000Z',
          hadRework: true,
        },
        {
          estimateHours: 10,
          actualHours: 12,
          issueType: 'story',
          completedAt: '2026-08-15T00:00:00.000Z',
          firstInProgressAt: '2026-08-14T00:00:00.000Z',
        },
        {
          estimateHours: 5,
          actualHours: 5,
          issueType: 'task',
          completedAt: '2026-08-16T00:00:00.000Z',
          firstInProgressAt: '2026-08-16T00:00:00.000Z',
        },
        {
          estimateHours: 6,
          actualHours: 7,
          issueType: 'task',
          completedAt: '2026-08-17T00:00:00.000Z',
          firstInProgressAt: '2026-08-17T00:00:00.000Z',
        },
      ],
      projectsCompleted: 2,
      primaryDomain: 'be',
    });
    assert.equal(rollup.confidence, 'medium');
    assert.equal(rollup.sampleSize.tasksCompleted, 5);
    assert.ok(rollup.estimation.accuracyPct > 80);
    assert.equal(rollup.quality.bugRate, 0.2);
    assert.equal(rollup.quality.reworkRate, 0.2);
    assert.ok(rollup.cycleTimeHours.sampleSize === 5);
    assert.equal(rollup.experience.primaryDomain, 'be');
  });
});
