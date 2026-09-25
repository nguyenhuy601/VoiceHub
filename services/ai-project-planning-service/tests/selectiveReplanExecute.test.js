const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { clearRegistry } = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');
const { resolveToolsForImpactScope } = require('../src/feedback/selectiveReplan');
const { runToolsSequence } = require('../src/orchestration/runToolsSequence');

describe('selectiveReplan G16 execute', () => {
  before(() => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
  });

  it('maps resource|schedule to Matching/Schedule tools (no job keys)', () => {
    const steps = resolveToolsForImpactScope(['resource', 'schedule']);
    const names = steps.map((s) => s.toolName);
    assert.ok(names.includes('EmployeeMatchingTool'));
    assert.ok(names.includes('ScheduleTool'));
    assert.ok(names.includes('SequencingTool'));
    assert.ok(!steps.some((s) => s.jobKey));
  });

  it('ProjectPlanTool never autoConfirm on selective full HOW', () => {
    const steps = resolveToolsForImpactScope([]);
    const plan = steps.find((s) => s.toolName === 'ProjectPlanTool');
    assert.ok(plan);
    assert.equal(plan.autoConfirm, false);
  });

  it('runToolsSequence selective effort step updates planning without jobs', async () => {
    const steps = resolveToolsForImpactScope(['effort']);
    const seq = await runToolsSequence(steps, {
      container: {
        planning: {
          tasks: [
            { id: 'A', name: 'API', suggestedRoleKey: 'backend', effortHours: 8 },
          ],
        },
        analyses: {},
        resource: {},
      },
      pack: {},
      snapshotId: 'snap-sel-1',
    });
    assert.equal(seq.container.jobs, undefined);
    assert.ok(seq.container.planning?.effort || seq.history.some((h) => h.includes('Effort')));
  });
});
