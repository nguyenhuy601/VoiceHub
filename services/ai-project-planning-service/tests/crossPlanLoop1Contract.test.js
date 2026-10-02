/**
 * PLAN 0.5 / gap-closure — C2 Loop1 context + C6 Qdrant-once.
 * Production Gate1 revise seeds g4Opts from pack.loop1Reuse (Plan B durable).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { runAgentPhase } = require('../src/orchestration/agentLoopRunner');
const { normalizeAgentState } = require('../src/checkpoint/agentStateSchema');
const {
  classifyCheckpointLifecycle,
  LIFECYCLE,
} = require('../src/checkpoint/checkpointLifecycle');
const { hasLoop1ChildTriad } = require('../src/contracts/loopStateContract');
const { registerDefaultTools } = require('../src/tools/registerDefaultTools');
const {
  buildLoop1ReuseArtifact,
  toLoop1G4OptsSeed,
} = require('../src/knowledge/loop1ReuseArtifact');

const SNAP_ID = '507f1f77bcf86cd799439011';
const PARENT_RUN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CHILD_RUN = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function minimalSnapshot(extra = {}) {
  return {
    snapshotId: SNAP_ID,
    overview: { requirementName: 'Demo', startDate: '2026-01-01', deadline: '2026-03-01' },
    functionalRequirements: [
      { id: 'FR-1', externalId: 'FR-1', title: 'Login', description: 'User logs in', parentId: 'M1' },
      { id: 'M1', externalId: 'M1', title: 'Auth', level: 'Module' },
    ],
    ...extra,
  };
}

function priorPartialFixture() {
  return {
    selection: {
      candidates: [
        { id: 'FR-1', externalId: 'FR-1', title: 'Login', description: 'User logs in' },
      ],
      counts: { candidates: 1, clear: 1, total: 1 },
    },
    projected: {
      snapshotId: SNAP_ID,
      overview: { requirementName: 'Demo' },
      functionalRequirements: [
        { id: 'FR-1', externalId: 'FR-1', title: 'Login', description: 'User logs in' },
      ],
    },
    functionalRequirements: [
      { id: 'FR-1', externalId: 'FR-1', title: 'Login', description: 'User logs in' },
    ],
    toolResult: { ok: true, facts: {} },
    toolEvidence: [],
    constraintFacts: [],
  };
}

/** Mirrors PS startPhase after reading pack.phase_what.loop1Reuse */
function productionLoop1G4OptsFromDurable() {
  const artifact = buildLoop1ReuseArtifact({
    snapshotId: SNAP_ID,
    sourceRunId: PARENT_RUN,
    corpusContentHash: 'corpus-hash-n',
    contextPackage: {
      query: 'what_requirements',
      docs: [{ id: 'd1', text: 'Login FR context' }],
      snapshotId: SNAP_ID,
    },
    priorPartial: priorPartialFixture(),
  });
  const seed = toLoop1G4OptsSeed(artifact, SNAP_ID);
  return {
    forceHeuristic: true,
    ...seed,
    env: {
      ...process.env,
      G7_RAG_MODE: 'qdrant',
      G7_INGEST_AFTER_QUALITY: '1',
    },
  };
}

describe('crossPlanLoop1Contract C2/C6', () => {
  before(() => {
    registerDefaultTools();
  });

  it('C3 baseline: parent completed is TERMINAL; child triad seeds without parent CP', () => {
    assert.equal(
      classifyCheckpointLifecycle({ status: 'completed' }),
      LIFECYCLE.TERMINAL
    );
    const child = normalizeAgentState({
      runId: CHILD_RUN,
      parentRunId: PARENT_RUN,
      generationId: CHILD_RUN,
      snapshotId: SNAP_ID,
      history: ['GATE1_REJECT', 'HUMAN_FEEDBACK', 'GENERATION_CREATED'],
      humanFeedback: {
        kind: 'requirement_feedback',
        source: 'gate1',
        rawText: 'thiếu NFR',
      },
      goal: 'phase_what_understanding',
      currentGoal: 'Gate1 Loop1 revise: thiếu NFR',
      constraints: [{ type: 'loop1_feedback', text: 'thiếu NFR' }],
      toolResults: [],
    });
    assert.equal(child.parentRunId, PARENT_RUN);
    assert.equal(child.generationId, CHILD_RUN);
    assert.equal(child.snapshotId, SNAP_ID);
    assert.equal(child.humanFeedback.source, 'gate1');
    assert.equal(hasLoop1ChildTriad(child.history), true);
  });

  it('C2/C6 PASS: production-shaped Loop1 with durable loop1Reuse skips Step2/3', async () => {
    let ingestCalls = 0;
    const g4Opts = productionLoop1G4OptsFromDurable();
    g4Opts.qdrant = {
      async ensureCollection() {
        return { created: true };
      },
      async upsertPoints() {
        ingestCalls += 1;
        throw new Error('C6: upsert must not run on Loop1 reuse');
      },
    };
    g4Opts.embedFn = async () => {
      ingestCalls += 1;
      throw new Error('C6: embed must not run on Loop1 reuse');
    };

    const result = await runAgentPhase({
      phase: 'what',
      container: {},
      pack: { overview: { requirementName: 'Demo' } },
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      runId: CHILD_RUN,
      parentRunId: PARENT_RUN,
      generationId: CHILD_RUN,
      humanFeedback: {
        kind: 'requirement_feedback',
        source: 'gate1',
        rawText: 'Gate1 reject: thiếu NFR security',
      },
      g4Opts,
    });

    assert.ok(result.history.includes('step2:skipped'), 'C2: Step2 skipped');
    assert.ok(result.history.includes('step3:skipped'), 'C6: Step3 skipped');
    assert.ok(result.history.includes('loop1:reenter_step4'));
    assert.equal(ingestCalls, 0, 'C6: Qdrant ingest=0 on Loop1');
  });

  it('without durable reuse flags, Loop1 still full_prepare (documents missing pack artifact)', async () => {
    const result = await runAgentPhase({
      phase: 'what',
      container: {},
      pack: { overview: { requirementName: 'Demo' } },
      snapshot: minimalSnapshot(),
      snapshotId: SNAP_ID,
      runId: CHILD_RUN,
      parentRunId: PARENT_RUN,
      generationId: CHILD_RUN,
      humanFeedback: {
        kind: 'requirement_feedback',
        source: 'gate1',
        rawText: 'Gate1 reject: thiếu actor',
      },
      g4Opts: {
        forceHeuristic: true,
        loop1Reenter: true,
        env: { ...process.env, G7_RAG_MODE: 'off', G7_INGEST_AFTER_QUALITY: '0' },
      },
    });
    assert.ok(result.history.includes('step2:understanding'));
    assert.equal(result.history.includes('step2:skipped'), false);
  });

  it('C5: lean hydrate path does not supply AgentState contextPackage (pack loop1Reuse does)', async () => {
    const {
      hydrateRunInputFromSnapshot,
    } = require('../src/knowledge/hydrateRunInputFromSnapshot');
    const hydrated = await hydrateRunInputFromSnapshot(
      {
        snapshotId: SNAP_ID,
        packId: 'pack-1',
        organizationId: 'org-1',
        input: {},
      },
      {
        fetchFn: async () => ({
          snapshot: minimalSnapshot(),
          pack: { overview: { requirementName: 'Demo' } },
          packContentHash: 'abc',
          pipelineVersion: 1,
        }),
      }
    );
    assert.equal(hydrated.mode, 'hydrate');
    assert.equal(hydrated.contextPackage, undefined);
    assert.equal(hydrated.priorPartial, undefined);
  });
});
