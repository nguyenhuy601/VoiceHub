/**
 * WHAT timing helper — measure-only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createWhatTiming,
  markStage,
  finalizeWhatTiming,
  sumStageMs,
} = require('../src/orchestration/whatTiming');

describe('whatTiming', () => {
  it('marks stages and sums ms', () => {
    let t = createWhatTiming({ round: 0, packId: 'P1' });
    t = markStage(t, 'hydrate', 100);
    t = markStage(t, 'understand', { ms: 200, frCount: 45 });
    t = markStage(t, 'bg_derive', { ms: 1000, evalCount: 50 });
    assert.equal(t.stages.hydrate.ms, 100);
    assert.equal(t.stages.understand.frCount, 45);
    assert.equal(sumStageMs(t.stages), 1300);
    const final = finalizeWhatTiming(t, { totalMs: 1400 });
    assert.equal(final.totalMs, 1400);
    assert.equal(final.sumStages, 1300);
    assert.equal(final.round, 0);
  });
});
