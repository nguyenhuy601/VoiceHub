/**
 * PLAN 0.5 — C1 ownership + C4 lifecycle + C7 macro boundary static contracts.
 *
 * Product code is not modified; this file locks ownership rules and inventory
 * classifications (KEEP / MOVE TO 0 / MOVE TO B / KEEP IN A / CONFLICT).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  classifyCheckpointLifecycle,
  clearCheckpointIfTerminal,
  LIFECYCLE,
} = require('../src/checkpoint/checkpointLifecycle');
const { deleteCheckpoint } = require('../src/checkpoint/checkpointStore');
const {
  HARD_TERMINAL_STATUSES,
} = require('../src/checkpoint/checkpointLifecycle');

const SRC = path.join(__dirname, '..', 'src');

function readSrc(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

/**
 * C1 ownership inventory (hot files) — classification vs three plans.
 * Plan 0 = Agent State; Plan A = WHAT Remap; Plan B = Data Lineage.
 */
const OWNERSHIP_INVENTORY = Object.freeze([
  {
    file: 'checkpoint/agentStateSchema.js',
    owner: 'Plan0',
    classify: 'KEEP_PLAN0',
    note: 'Plan A must consume only — strip from Plan A Files Affected',
  },
  {
    file: 'feedback/feedbackParser.js',
    owner: 'Plan0',
    classify: 'KEEP_PLAN0',
    note: 'source gate1|gate2 owned by Plan 0',
  },
  {
    file: 'checkpoint/checkpointLifecycle.js',
    owner: 'Plan0',
    classify: 'KEEP_PLAN0',
    note: 'sole owner of terminal deleteCheckpoint policy',
  },
  {
    file: 'run/runStore.js',
    owner: 'Plan0',
    classify: 'SPLIT',
    note: 'Plan0: parentRunId/terminal; Plan A: legacy data_review cancel+activeKey only',
  },
  {
    file: 'controllers/internalPlanning.controller.js',
    owner: 'SHARED',
    classify: 'SPLIT',
    note: 'Plan0 lineage/lifecycle; Plan A no Data Gate + legacy cleanup; Plan B lean hydrate',
  },
  {
    file: 'orchestration/agentLoopRunner.js',
    owner: 'PlanA',
    classify: 'KEEP_PLANA',
    note: 'Plan B consume: no double ingest; Plan 0 consume: health/history',
  },
  {
    file: 'orchestration/whatPhaseGraph.js',
    owner: 'PlanA',
    classify: 'KEEP_PLANA',
    note: 'macro/workflow parity',
  },
  {
    file: 'engines/g4/runG4Pipeline.js',
    owner: 'PlanB',
    classify: 'KEEP_PLANB',
    note: 'CONFLICT risk with Plan A pause removal — A labels only; B owns ingest/assemble',
  },
  {
    file: 'knowledge/hydrateRunInputFromSnapshot.js',
    owner: 'PlanB',
    classify: 'KEEP_PLANB',
    note: 'durable snapshot/pack; not AgentState contextPackage',
  },
  {
    file: 'knowledge/loop1ReuseArtifact.js',
    owner: 'PlanB',
    classify: 'KEEP_PLANB',
    note: 'Loop1 durable priorPartial+contextPackage+corpusHash (pack SoT)',
  },
  {
    file: 'retrieval/ingestSnapshotToQdrant.js',
    owner: 'PlanB',
    classify: 'KEEP_PLANB',
    note: 'corpusHash skip',
  },
]);

describe('crossPlanOwnershipBoundary C1', () => {
  it('inventory covers required hot files with single primary owner or SPLIT', () => {
    assert.ok(OWNERSHIP_INVENTORY.length >= 8);
    for (const row of OWNERSHIP_INVENTORY) {
      assert.ok(row.file, 'file path');
      assert.ok(
        ['Plan0', 'PlanA', 'PlanB', 'SHARED'].includes(row.owner),
        `${row.file} owner`
      );
      assert.ok(
        ['KEEP_PLAN0', 'KEEP_PLANA', 'KEEP_PLANB', 'SPLIT', 'CONFLICT'].includes(
          row.classify
        ),
        `${row.file} classify`
      );
      const abs = path.join(SRC, row.file);
      assert.equal(fs.existsSync(abs), true, `missing ${row.file}`);
    }
  });

  it('RULE-0.5-01: agentStateSchema + feedbackParser owned by Plan0 not Plan A', () => {
    const schema = OWNERSHIP_INVENTORY.find((r) =>
      r.file.endsWith('agentStateSchema.js')
    );
    const parser = OWNERSHIP_INVENTORY.find((r) =>
      r.file.endsWith('feedbackParser.js')
    );
    assert.equal(schema.owner, 'Plan0');
    assert.equal(parser.owner, 'Plan0');
  });

  it('RULE-0.5-01: runG4Pipeline primary owner Plan B; runner/graph Plan A', () => {
    const g4 = OWNERSHIP_INVENTORY.find((r) => r.file.includes('runG4Pipeline'));
    const runner = OWNERSHIP_INVENTORY.find((r) =>
      r.file.includes('agentLoopRunner')
    );
    assert.equal(g4.owner, 'PlanB');
    assert.equal(runner.owner, 'PlanA');
  });
});

describe('crossPlanOwnershipBoundary C4 lifecycle', () => {
  it('completed/cancelled/expired → TERMINAL; active → ACTIVE; failed seekable → RESUMABLE', () => {
    assert.equal(
      classifyCheckpointLifecycle({ status: 'completed' }),
      LIFECYCLE.TERMINAL
    );
    assert.equal(
      classifyCheckpointLifecycle({ status: 'cancelled' }),
      LIFECYCLE.TERMINAL
    );
    assert.equal(
      classifyCheckpointLifecycle({ status: 'expired' }),
      LIFECYCLE.TERMINAL
    );
    assert.equal(
      classifyCheckpointLifecycle({ status: 'running' }),
      LIFECYCLE.ACTIVE
    );
    assert.equal(
      classifyCheckpointLifecycle({ status: 'waiting_human' }),
      LIFECYCLE.ACTIVE
    );
    assert.equal(
      classifyCheckpointLifecycle({
        status: 'failed',
        checkpoint: { currentToolIndex: 2 },
      }),
      LIFECYCLE.RESUMABLE
    );
    assert.ok(HARD_TERMINAL_STATUSES.has('completed'));
  });

  it('clearCheckpointIfTerminal is the generic delete owner (Plan 0)', async () => {
    let deleted = 0;
    const out = await clearCheckpointIfTerminal(
      'run-terminal',
      { status: 'completed' },
      {
        deleteCheckpoint: async () => {
          deleted += 1;
        },
        env: { AGENT_STATE_KEEP_TERMINAL: '0' },
      }
    );
    assert.equal(out.lifecycle, LIFECYCLE.TERMINAL);
    assert.equal(out.deleted, true);
    assert.equal(deleted, 1);

    const keep = await clearCheckpointIfTerminal(
      'run-active',
      { status: 'running' },
      {
        deleteCheckpoint: async () => {
          deleted += 1;
        },
      }
    );
    assert.equal(keep.deleted, false);
    assert.equal(deleted, 1);
  });

  it('controller uses clearCheckpointIfTerminal for terminal status; legacy cancel may call deleteCheckpoint', () => {
    const ctrl = readSrc('controllers/internalPlanning.controller.js');
    assert.ok(
      ctrl.includes('clearCheckpointIfTerminal'),
      'Plan 0 generic lifecycle path required'
    );
    assert.ok(
      ctrl.includes("require('../checkpoint/checkpointLifecycle')"),
      'lifecycle module wired'
    );
    // Legacy data_review cleanup (Plan A business) may call deleteCheckpoint directly
    assert.ok(
      ctrl.includes('data_review'),
      'legacy data_review path present for Plan A cleanup ownership'
    );
    // deleteCheckpoint export exists but must not be the only lifecycle policy
    assert.equal(typeof deleteCheckpoint, 'function');
  });
});

describe('crossPlanOwnershipBoundary C7 macro boundary', () => {
  it('runner documents Step2 understanding vs Step4 agentic; G4 owns ingest comment (Plan B)', () => {
    const runner = readSrc('orchestration/agentLoopRunner.js');
    assert.ok(
      runner.includes('step2:understanding') || runner.includes('Step 2'),
      'macro Step2 marker'
    );
    assert.ok(
      runner.includes('agent_understand') || runner.includes('Step 4'),
      'macro Step4 marker'
    );
    assert.ok(
      runner.includes('step2:skipped') && runner.includes('step3:skipped'),
      'Loop1 skip markers exist (ideal path)'
    );

    const g4 = readSrc('engines/g4/runG4Pipeline.js');
    assert.ok(
      /G4 owns|RULE-DL-0/.test(g4),
      'Plan B sole-owner ingest/assemble documented in G4'
    );
    assert.ok(
      g4.includes('reuseContextPackage') || g4.includes('priorPartial'),
      'G4 accepts reuse inputs for Loop1 durable context'
    );
  });

  it('whatPhaseGraph keeps pauseAtDataGate false (Plan A no Data Gate)', () => {
    const graph = readSrc('orchestration/whatPhaseGraph.js');
    assert.ok(graph.includes('pauseAtDataGate: false'));
  });
});

describe('crossPlanOwnershipBoundary C5 lean hydrate vs Loop1', () => {
  it('hydrate helper returns snapshot/pack only — not AgentState semantic package', () => {
    const hydrate = readSrc('knowledge/hydrateRunInputFromSnapshot.js');
    assert.ok(hydrate.includes('mode=hydrate'));
    assert.ok(hydrate.includes('embedded_legacy'));
    assert.equal(hydrate.includes('contextPackage'), false);
    assert.equal(hydrate.includes('priorPartial'), false);
  });
});
