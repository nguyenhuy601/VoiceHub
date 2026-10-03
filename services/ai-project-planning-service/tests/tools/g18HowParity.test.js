const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { clearRegistry } = require('../../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../../src/tools/registerDefaultTools');
const { runHowPhaseTools } = require('../../src/orchestration/runToolsSequence');
const { HOW_PHASE_TOOL_STEPS } = require('../../src/orchestration/jobToToolsMap');

function baseContainer() {
  return {
    planning: {
      tasks: [
        { id: 'A', name: 'API', suggestedRoleKey: 'backend', effortHours: 8 },
        { id: 'B', name: 'QA', suggestedRoleKey: 'qa', effortHours: 4 },
      ],
      roles: [],
      skills: [],
    },
    analyses: {
      capability: { items: [] },
      dependency: { edges: [{ from: 'B', to: 'A' }] },
    },
    resource: {},
  };
}

describe('G18 HOW path (phase-only, no job shells)', () => {
  before(() => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
  });

  it('runHowPhaseTools writes artifacts and phase_how stays unset here', async () => {
    const seq = await runHowPhaseTools({
      container: baseContainer(),
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: { employees: [] },
      snapshotId: 'snap-g18-2',
    });
    assert.ok(HOW_PHASE_TOOL_STEPS.length >= 8);
    assert.equal(seq.container.jobs, undefined);
    assert.ok(seq.toolResults.every((t) => t.toolName));
    assert.ok(seq.history.some((h) => h.startsWith('execute:WbsTool')));
    assert.ok(seq.history.some((h) => h.startsWith('execute:ProjectPlanTool')));
    assert.ok(seq.container.planning);
  });
});
