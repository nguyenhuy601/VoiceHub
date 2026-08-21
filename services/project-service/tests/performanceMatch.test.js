const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreHistoricalPerformance,
  toSlimPerformance,
} = require('../src/utils/performanceMatch');

function rollup(overrides = {}) {
  const { estimation, quality, velocity, ...rest } = overrides;
  return {
    confidence: 'high',
    estimation: { accuracyPct: 90, ...(estimation || {}) },
    quality: { reworkRate: 0, reopenRate: 0, ...(quality || {}) },
    velocity: { actualHoursPerWeek: 20, ...(velocity || {}) },
    ...rest,
  };
}

describe('performanceMatch', () => {
  it('returns boost 0 when rollup missing or confidence low', () => {
    assert.equal(scoreHistoricalPerformance(null).boost, 0);
    assert.equal(scoreHistoricalPerformance(undefined).boost, 0);
    const low = scoreHistoricalPerformance(rollup({ confidence: 'low' }));
    assert.equal(low.boost, 0);
    assert.equal(low.reasons.length, 0);
    assert.ok(low.slim);
  });

  it('gives positive boost for high accuracy + healthy velocity', () => {
    const r = scoreHistoricalPerformance(
      rollup({
        confidence: 'high',
        estimation: { accuracyPct: 95 },
        velocity: { actualHoursPerWeek: 18 },
      })
    );
    assert.ok(r.boost > 0);
    assert.ok(r.reasons.includes('perf_accuracy'));
    assert.ok(r.reasons.includes('perf_velocity_healthy'));
  });

  it('reduces boost when rework rate is high', () => {
    const good = scoreHistoricalPerformance(
      rollup({
        confidence: 'high',
        estimation: { accuracyPct: 90 },
        quality: { reworkRate: 0, reopenRate: 0 },
        velocity: { actualHoursPerWeek: 20 },
      })
    );
    const bad = scoreHistoricalPerformance(
      rollup({
        confidence: 'high',
        estimation: { accuracyPct: 90 },
        quality: { reworkRate: 0.5, reopenRate: 0 },
        velocity: { actualHoursPerWeek: 20 },
      })
    );
    assert.ok(bad.boost < good.boost);
    assert.ok(bad.reasons.includes('perf_rework_penalty'));
  });

  it('scales medium confidence lower than high for positive boost', () => {
    const high = scoreHistoricalPerformance(rollup({ confidence: 'high' }));
    const medium = scoreHistoricalPerformance(rollup({ confidence: 'medium' }));
    assert.ok(medium.boost < high.boost);
    assert.ok(medium.boost > 0);
  });

  it('toSlimPerformance extracts summary fields', () => {
    const slim = toSlimPerformance(
      rollup({
        confidence: 'medium',
        estimation: { accuracyPct: 70 },
        quality: { reworkRate: 0.1 },
        velocity: { actualHoursPerWeek: 12 },
      })
    );
    assert.equal(slim.confidence, 'medium');
    assert.equal(slim.estimationAccuracyPct, 70);
    assert.equal(slim.reworkRate, 0.1);
    assert.equal(slim.actualHoursPerWeek, 12);
  });
});
