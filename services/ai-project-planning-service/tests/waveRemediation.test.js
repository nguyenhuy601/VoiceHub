const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveToolsForImpactScope,
} = require('../src/feedback/selectiveReplan');
const { decideEvaluateAction } = require('../src/orchestration/evaluatePolicy');
const {
  ingestSnapshotToQdrant,
  pointId,
} = require('../src/retrieval/ingestSnapshotToQdrant');
const { retrieveQdrant } = require('../src/retrieval/retrieveQdrant');

describe('selectiveReplan G16', () => {
  it('maps resource|schedule to Matching/Schedule tools', () => {
    const steps = resolveToolsForImpactScope(['resource', 'schedule']);
    const names = steps.map((s) => s.toolName);
    assert.ok(names.includes('EmployeeMatchingTool'));
    assert.ok(names.includes('ScheduleTool'));
    assert.ok(!names.includes('WbsTool'));
  });
});

describe('evaluatePolicy G8', () => {
  it('RETRIEVE when not enough info and no citations', () => {
    const d = decideEvaluateAction({
      evaluate: { enoughInfoToContinue: false },
      contextPackage: { citations: [] },
      toolResults: [{ toolName: 'WbsTool' }],
    });
    assert.equal(d.action, 'RETRIEVE');
  });

  it('CONTINUE when enough info', () => {
    const d = decideEvaluateAction({
      evaluate: { enoughInfoToContinue: true },
      contextPackage: { citations: [{ citationId: 'c1' }] },
      toolResults: [],
    });
    assert.equal(d.action, 'CONTINUE');
  });
});

describe('g7 ingest/retrieve mocks', () => {
  it('pointId stable', () => {
    assert.equal(
      pointId('SNAP-1', 'skill:react', 'v1'),
      pointId('SNAP-1', 'skill:react', 'v1')
    );
  });

  it('ingest upserts with snapshotId filter payload', async () => {
    const points = [];
    const qdrant = {
      async ensureCollection() {
        return { created: true };
      },
      async upsertPoints(p) {
        points.push(...p);
      },
    };
    const out = await ingestSnapshotToQdrant({
      snapshotId: 'SNAP-A',
      snapshot: {
        snapshotId: 'SNAP-A',
        skillCatalog: { version: 'v1', skills: [{ skillId: 'skill:react', name: 'React' }] },
      },
      embedFn: async () => ({
        ok: true,
        embedding: [0.1, 0.2, 0.3],
        model: 'nomic',
        embeddingVersion: 'test-v1',
      }),
      qdrant,
      env: { G7_EMBEDDING_VERSION: 'test-v1' },
    });
    assert.ok(out.upserted >= 1);
    assert.ok(points.every((p) => p.payload.snapshotId === 'SNAP-A'));
  });

  it('retrieveQdrant rejects missing snapshotId', async () => {
    await assert.rejects(
      () => retrieveQdrant({ query: 'x' }),
      (e) => e.code === 'SNAPSHOT_BIND_REQUIRED'
    );
  });

  it('retrieve filters to snapshot', async () => {
    const out = await retrieveQdrant({
      query: 'react',
      snapshotId: 'SNAP-B',
      embedFn: async () => ({
        ok: true,
        embedding: [1, 0],
        model: 'nomic',
        embeddingVersion: 'v1',
      }),
      qdrant: {
        async search({ snapshotId }) {
          assert.equal(snapshotId, 'SNAP-B');
          return [
            {
              id: 1,
              score: 0.9,
              payload: {
                snapshotId: 'SNAP-B',
                sourceId: 'skill:react',
                text: 'React frontend',
                docType: 'skill_def',
              },
            },
          ];
        },
      },
    });
    assert.equal(out.modeUsed, 'qdrant');
    assert.equal(out.isStub, false);
    assert.equal(out.docs[0].sourceId, 'skill:react');
  });
});
