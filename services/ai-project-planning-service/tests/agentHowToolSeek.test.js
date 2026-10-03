const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { clearRegistry } = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');
const { runHowToolLoop } = require('../src/orchestration/runHowToolLoop');
const { runAgentPhase } = require('../src/orchestration/agentLoopRunner');

describe('HOW tool seek (RULE-SEEK-01)', () => {
  before(() => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
  });

  it('runHowToolLoop startIndex skips earlier tools', async () => {
    const seen = [];
    const seq = await runHowToolLoop({
      steps: [
        { toolName: 'EffortTool' },
        { toolName: 'SequencingTool' },
      ],
      startIndex: 1,
      container: {
        planning: {
          tasks: [
            { id: 'A', name: 'API', suggestedRoleKey: 'backend', effortHours: 8 },
          ],
        },
        analyses: { dependency: { edges: [] } },
        resource: {},
      },
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: { employees: [] },
      snapshotId: 'snap-seek',
      onToolDone: async ({ toolName }) => {
        seen.push(toolName);
      },
    });
    assert.deepEqual(seen, ['SequencingTool']);
    assert.equal(seq.meta.startIndex, 1);
    assert.ok(seq.history.every((h) => !h.includes('EffortTool')));
    assert.ok(seq.history.some((h) => h.includes('SequencingTool')));
  });

  it('selective HOW skips understand and uses same runner', async () => {
    const progress = [];
    const snapId = '507f1f77bcf86cd799439011';
    const result = await runAgentPhase({
      phase: 'how',
      container: {
        planning: {
          tasks: [{ id: 'T1', title: 'Task', effortHours: 4 }],
        },
        resource: {},
      },
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: { employees: [] },
      snapshot: {
        snapshotId: snapId,
        overview: { startDate: '2026-01-01' },
        projected: { tasks: [{ id: 'T1' }] },
      },
      snapshotId: snapId,
      runId: '507f1f77bcf86cd799439099',
      selectiveToolNames: ['EffortTool'],
      onProgress: (p) => progress.push(p.node),
    });
    assert.equal(result.selective, true);
    assert.ok(!progress.includes('understand'));
    assert.ok(result.history.some((h) => h.includes('EffortTool')));
    assert.ok(!result.history.includes('understand'));
    assert.equal(result.container.phaseRuns?.phase_how?.status, 'ready');
  });
});
