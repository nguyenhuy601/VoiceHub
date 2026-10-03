const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { isAgentCoreF2Enabled } = require('../src/orchestration/agentCoreFlag');
const { clearRegistry } = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');
const { runAgentPhase } = require('../src/orchestration/agentLoopRunner');
const { STOP_REASONS } = require('../src/orchestration/agentBudget');

const SNAP_ID = '507f1f77bcf86cd799439011';
const RUN_ID = '507f1f77bcf86cd799439099';

function minimalSnapshot() {
  return {
    snapshotId: SNAP_ID,
    overview: { startDate: '2026-01-01', requirementName: 'Demo' },
    projected: { tasks: [{ id: 'T1' }] },
    functionalRequirements: [{ id: 'FR-1', title: 'Login' }],
  };
}

describe('Agent Core F2 flag', () => {
  it('defaults off', () => {
    assert.equal(isAgentCoreF2Enabled({}), false);
    assert.equal(isAgentCoreF2Enabled({ AGENT_CORE_F2: '0' }), false);
  });

  it('enables on 1/true/on', () => {
    assert.equal(isAgentCoreF2Enabled({ AGENT_CORE_F2: '1' }), true);
    assert.equal(isAgentCoreF2Enabled({ AGENT_CORE_F2: 'true' }), true);
    assert.equal(isAgentCoreF2Enabled({ AGENT_CORE_F2: 'on' }), true);
  });
});

describe('Agent Core F2 HOW graph', () => {
  let prevFlag;

  before(() => {
    prevFlag = process.env.AGENT_CORE_F2;
    process.env.AGENT_CORE_LG_MEMORY = '1';
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.AGENT_CORE_F2;
    else process.env.AGENT_CORE_F2 = prevFlag;
    delete process.env.AGENT_CORE_LG_MEMORY;
  });

  it('flag off uses JS path (agentCore=js)', async () => {
    process.env.AGENT_CORE_F2 = '0';
    const result = await runAgentPhase({
      phase: 'how',
      container: {
        planning: { tasks: [{ id: 'T1', title: 'Task', effortHours: 4 }] },
        resource: {},
      },
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: { employees: [] },
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      runId: RUN_ID,
      selectiveToolNames: ['EffortTool'],
    });
    assert.equal(result.agentCore, 'js');
    assert.equal(result.container.phaseRuns?.phase_how?.status, 'ready');
    assert.equal(result.feasibilitySignal?.notG13, true);
    assert.equal(typeof result.feasibility?.pass, 'boolean');
  });

  it('flag on selective HOW — langgraph parity', async () => {
    process.env.AGENT_CORE_F2 = '1';
    const progress = [];
    const result = await runAgentPhase({
      phase: 'how',
      container: {
        planning: { tasks: [{ id: 'T1', title: 'Task', effortHours: 4 }] },
        resource: {},
      },
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: { employees: [] },
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      runId: RUN_ID,
      selectiveToolNames: ['EffortTool'],
      onProgress: (p) => progress.push(p.node),
    });
    assert.equal(result.agentCore, 'langgraph');
    assert.equal(result.selective, true);
    assert.ok(!progress.includes('understand'));
    assert.ok(result.history.some((h) => h.includes('EffortTool')));
    assert.equal(result.container.phaseRuns?.phase_how?.status, 'ready');
    assert.equal(result.container.phaseRuns?.phase_how?.agentCore, 'langgraph');
    assert.equal(result.feasibilitySignal?.notG13, true);
    assert.equal(typeof result.feasibility?.pass, 'boolean');
    assert.ok(Array.isArray(result.feasibility?.failures));
    assert.equal(result.stopReason, STOP_REASONS.COMPLETE);
  });

  it('flag on respects budget maxToolCalls', async () => {
    process.env.AGENT_CORE_F2 = '1';
    const result = await runAgentPhase({
      phase: 'how',
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
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      runId: RUN_ID,
      selectiveToolNames: ['EffortTool', 'SequencingTool'],
      budget: {
        enforce: true,
        maxIterations: 50,
        wallMs: 60_000,
        maxToolCalls: 1,
      },
    });
    assert.equal(result.agentCore, 'langgraph');
    assert.equal(result.toolResults.length, 1);
    assert.equal(result.stopReason, STOP_REASONS.BUDGET_TOOLS);
    assert.equal(result.feasibilitySignal?.notG13, true);
  });

  it('SNAP boundary still enforced on F2 path', async () => {
    process.env.AGENT_CORE_F2 = '1';
    await assert.rejects(
      () =>
        runAgentPhase({
          phase: 'how',
          container: {},
          snapshotId: SNAP_ID,
          snapshot: null,
        }),
      (err) => err.code === 'SNAPSHOT_PAYLOAD_REQUIRED'
    );
  });
});
