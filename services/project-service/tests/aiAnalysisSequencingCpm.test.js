/**
 * T2 — Theoretical CPM A/B/C/D/E example (APS engine).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runSequencingCpm } = require('../../ai-project-planning-service/src/engines/sequencingCpm');

describe('sequencingCpm (APS)', () => {
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
    assert.equal(nodeC.totalFloat, 4);
  });
});
