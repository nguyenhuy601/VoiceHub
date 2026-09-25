const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runAgentPhase,
  HOW_PHASE_TOOL_NAMES,
} = require('../src/orchestration/agentLoopRunner');

const SNAP_ID = '507f1f77bcf86cd799439011';

function minimalSnapshot(extra = {}) {
  return {
    snapshotId: SNAP_ID,
    overview: { requirementName: 'Demo', startDate: '2026-01-01', deadline: '2026-03-01' },
    functionalRequirements: [
      { id: 'FR-1', title: 'Login', description: 'User logs in', parentId: 'M1' },
      { id: 'M1', title: 'Auth', level: 'Module' },
    ],
    ...extra,
  };
}

describe('runAgentPhase', () => {
  it('runs how phase and sets phase_how ready (no jobs)', async () => {
    const container = {
      schemaVersion: 2,
      planning: {
        tasks: [
          { id: 'T1', title: 'Task 1', effortHours: 8 },
          { id: 'T2', title: 'Task 2', effortHours: 4 },
        ],
      },
      resource: { assignments: {} },
    };
    const progress = [];
    const result = await runAgentPhase({
      phase: 'how',
      container,
      pack: { overview: { startDate: '2026-01-01', deadline: '2026-03-01' } },
      toolData: { employees: [] },
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      runId: '507f1f77bcf86cd799439012',
      onProgress: (p) => progress.push(p.node),
    });
    assert.equal(result.phase, 'how');
    assert.equal(result.hitl, 'gate2');
    assert.ok(result.durationMs >= 0);
    assert.ok(progress.includes('execute'));
    assert.ok(progress.includes('feasibility'));
    assert.equal(result.container.jobs, undefined);
    assert.equal(result.container.phaseRuns?.phase_how?.status, 'ready');
    assert.equal(result.container.phaseRuns?.phase_how?.hitl, 'gate2');
    assert.ok(HOW_PHASE_TOOL_NAMES.includes('ProjectPlanTool'));
  });

  it('rejects unknown phase', async () => {
    await assert.rejects(
      () =>
        runAgentPhase({
          phase: 'nope',
          container: {},
          snapshotId: SNAP_ID,
          snapshot: minimalSnapshot(),
        }),
      (err) => err.code === 'AGENT_PHASE_UNSUPPORTED'
    );
  });

  it('Track A: refuses pack-only without snapshot payload', async () => {
    await assert.rejects(
      () =>
        runAgentPhase({
          phase: 'what',
          container: {},
          pack: { overview: { requirementName: 'X' } },
          snapshotId: SNAP_ID,
          snapshot: null,
          g4Opts: { forceHeuristic: true },
        }),
      (err) => err.code === 'SNAPSHOT_PAYLOAD_REQUIRED'
    );
  });

  it('what phase returns gate1 hitl with g4Understanding + conflictAmbiguityGate', async () => {
    const result = await runAgentPhase({
      phase: 'what',
      container: {},
      pack: {
        overview: { requirementName: 'Demo' },
        functionalRequirements: [
          { id: 'FR-1', title: 'Login', description: 'User logs in', parentId: 'M1' },
          { id: 'M1', title: 'Auth', level: 'Module' },
        ],
      },
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      g4Opts: { forceHeuristic: true },
    });
    assert.equal(result.phase, 'what');
    assert.equal(result.hitl, 'gate1');
    assert.equal(result.stub, false);
    assert.ok(result.g4Understanding);
    assert.ok(Array.isArray(result.g4Understanding.requirements));
    assert.ok(result.g4Understanding.conflictAmbiguityGate);
    assert.equal(typeof result.g4Understanding.conflictAmbiguityGate.passed, 'boolean');
    assert.ok(result.container.analyses?.g4Understanding);
    assert.equal(result.container.phaseRuns?.phase_what?.mode, 'g4');
    assert.ok(result.container.phaseRuns?.phase_what?.conflictAmbiguityGate);
    assert.equal(result.container.jobs, undefined);
  });
});
