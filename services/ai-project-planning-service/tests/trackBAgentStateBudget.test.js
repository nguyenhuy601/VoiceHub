const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAgentBudget,
  evaluateStopCondition,
  STOP_REASONS,
} = require('../src/orchestration/agentBudget');
const {
  normalizeAgentState,
  buildInitialAgentFields,
} = require('../src/checkpoint/agentStateSchema');
const {
  buildFeasibilitySignal,
  signalToG13Candidate,
} = require('../src/validation/buildFeasibilitySignal');
const { decideEvaluateAction } = require('../src/orchestration/evaluatePolicy');
const { runHowToolLoop } = require('../src/orchestration/runHowToolLoop');
const { clearRegistry } = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');

describe('Track B agent budget / stop', () => {
  it('resolves defaults from env', () => {
    const b = resolveAgentBudget({
      env: {
        AGENT_BUDGET_ENFORCE: '1',
        AGENT_MAX_ITERATIONS: '10',
        AGENT_WALL_MS: '5000',
        AGENT_MAX_TOOL_CALLS: '3',
      },
    });
    assert.equal(b.enforce, true);
    assert.equal(b.maxIterations, 10);
    assert.equal(b.wallMs, 5000);
    assert.equal(b.maxToolCalls, 3);
  });

  it('stops on max tool calls', () => {
    const stop = evaluateStopCondition({
      budget: { enforce: true, maxIterations: 50, wallMs: 60_000, maxToolCalls: 2 },
      startedAt: Date.now(),
      iteration: 1,
      toolCallCount: 2,
    });
    assert.equal(stop.stop, true);
    assert.equal(stop.reason, STOP_REASONS.BUDGET_TOOLS);
  });

  it('stops on wall budget', () => {
    const startedAt = Date.now() - 10_000;
    const stop = evaluateStopCondition({
      budget: { enforce: true, maxIterations: 50, wallMs: 1000, maxToolCalls: 40 },
      startedAt,
      iteration: 0,
      toolCallCount: 0,
      now: Date.now(),
    });
    assert.equal(stop.stop, true);
    assert.equal(stop.reason, STOP_REASONS.BUDGET_WALL);
  });

  it('does not stop when enforce off', () => {
    const stop = evaluateStopCondition({
      budget: { enforce: false, maxIterations: 1, wallMs: 1, maxToolCalls: 0 },
      startedAt: 0,
      iteration: 100,
      toolCallCount: 100,
    });
    assert.equal(stop.stop, false);
  });
});

describe('Track B AgentState fields', () => {
  it('buildInitialAgentFields has goal, constraints, iteration', () => {
    const fields = buildInitialAgentFields({ phase: 'how', runId: 'r1' });
    assert.ok(fields.goal);
    assert.equal(fields.currentGoal, fields.goal);
    assert.equal(fields.constraints.g8NotG13, true);
    assert.equal(fields.iteration, 0);
    assert.equal(fields.feasibilitySignal, null);
  });

  it('normalizeAgentState keeps Track B keys', () => {
    const n = normalizeAgentState({
      runId: 'r1',
      goal: 'plan_how',
      constraints: { snapshotBound: true },
      budget: { maxToolCalls: 5 },
      stopReason: STOP_REASONS.COMPLETE,
      feasibilitySignal: { kind: 'feasibility_signal', notG13: true, passHint: true },
      toolResults: [{ toolName: 'WbsTool' }],
      iteration: 2,
    });
    assert.equal(n.goal, 'plan_how');
    assert.equal(n.currentGoal, 'plan_how');
    assert.equal(n.constraints.snapshotBound, true);
    assert.equal(n.budget.maxToolCalls, 5);
    assert.equal(n.stopReason, STOP_REASONS.COMPLETE);
    assert.equal(n.feasibilitySignal.notG13, true);
    assert.equal(n.iteration, 2);
    assert.equal(n.toolResults.length, 1);
  });
});

describe('Track B feasibilitySignal ≠ G13', () => {
  it('signal is marked notG13 and does not gate agent', () => {
    const signal = buildFeasibilitySignal({
      toolResults: [],
      container: { planning: { tasks: [] } },
      runId: 'r1',
      snapshotId: 's1',
    });
    assert.equal(signal.kind, 'feasibility_signal');
    assert.equal(signal.notG13, true);
    assert.equal(typeof signal.passHint, 'boolean');
  });

  it('signalToG13Candidate marks agent_exit_candidate for Gate2', () => {
    const signal = buildFeasibilitySignal({
      toolResults: [{ toolName: 'WbsTool' }],
      container: { planning: { tasks: [{ id: 'T1' }] } },
    });
    const g13 = signalToG13Candidate(signal, { runId: 'r1', snapshotId: 's1' });
    assert.equal(g13.fromSignal, true);
    assert.equal(g13.source, 'agent_exit_candidate');
    assert.equal(g13.pass, signal.passHint);
  });
});

describe('Track B Wave F evaluate JS', () => {
  it('NEED_TOOL when citations exist but no tools and not enough info', () => {
    const d = decideEvaluateAction({
      evaluate: { enoughInfoToContinue: false },
      contextPackage: { citations: [{ citationId: 'c1' }] },
      toolResults: [],
    });
    assert.equal(d.action, 'NEED_TOOL');
  });

  it('NEED_TOOL when citations+tools still not enough', () => {
    const d = decideEvaluateAction({
      evaluate: { enoughInfoToContinue: false, reason: 'gaps' },
      contextPackage: { citations: [{ citationId: 'c1' }] },
      toolResults: [{ toolName: 'WbsTool' }],
    });
    assert.equal(d.action, 'NEED_TOOL');
    assert.match(d.reason, /need_more_tools|gaps/);
  });
});

describe('Track B how loop respects maxToolCalls', () => {
  it('stops early when budget maxToolCalls=1', async () => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
    const seq = await runHowToolLoop({
      steps: [
        { toolName: 'EffortTool' },
        { toolName: 'SequencingTool' },
      ],
      container: {
        planning: {
          tasks: [{ id: 'A', name: 'API', suggestedRoleKey: 'backend', effortHours: 8 }],
        },
        analyses: { dependency: { edges: [] } },
        resource: {},
      },
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: { employees: [] },
      snapshotId: 'snap-b',
      budget: { enforce: true, maxIterations: 50, wallMs: 60_000, maxToolCalls: 1 },
    });
    assert.equal(seq.toolResults.length, 1);
    assert.equal(seq.stopReason, STOP_REASONS.BUDGET_TOOLS);
    assert.ok(seq.history.some((h) => String(h).startsWith('stop:')));
  });
});
