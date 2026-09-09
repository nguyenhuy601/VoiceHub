/**
 * T2 — Theoretical CPM A/B/C/D/E example.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runSequencingCpm } = require('../src/utils/aiAnalysis/aiAnalysisSequencingCpm');

describe('aiAnalysisSequencingCpm', () => {
  it('computes path 52h and float 4h for C', () => {
    const container = {
      planning: {
        tasks: [
          { id: 'A', effortHours: 8 },
          { id: 'B', effortHours: 24 },
          { id: 'C', effortHours: 20 },
          { id: 'D', effortHours: 8 },
          { id: 'E', effortHours: 12 },
        ],
      },
      analyses: {
        dependency: {
          // from depends on to
          edges: [
            { from: 'B', to: 'A' },
            { from: 'C', to: 'A' },
            { from: 'D', to: 'B' },
            { from: 'D', to: 'C' },
            { from: 'E', to: 'D' },
          ],
        },
      },
    };

    const result = runSequencingCpm(container);
    assert.equal(result.theoreticalCpm.projectDurationHours, 52);
    assert.equal(result.theoreticalCpm.sumEffortHours, 72);
    assert.deepEqual(result.theoreticalCpm.criticalPath, ['A', 'B', 'D', 'E']);

    const nodeC = result.theoreticalCpm.nodes.find((n) => n.workId === 'C');
    assert.ok(nodeC);
    // D starts at max(EF_B, EF_C)=32 → LS_C=12, ES_C=8 → float=4
    assert.equal(nodeC.totalFloat, 4);
    assert.equal(nodeC.isCritical, false);

    const nodeB = result.theoreticalCpm.nodes.find((n) => n.workId === 'B');
    assert.equal(nodeB.isCritical, true);
    assert.equal(nodeB.totalFloat, 0);

    assert.ok(result.sequence.waves.length >= 2);
    assert.ok(result.criticalWorkIds.includes('A'));
    assert.ok(!result.criticalWorkIds.includes('C'));
  });
});
