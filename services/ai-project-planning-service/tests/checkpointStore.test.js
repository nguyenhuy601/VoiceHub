const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

function createMemoryRedis() {
  const map = new Map();
  return {
    async set(key, val) {
      map.set(String(key), String(val));
      return 'OK';
    },
    async get(key) {
      return map.has(String(key)) ? map.get(String(key)) : null;
    },
    async del(key) {
      const k = String(key);
      const had = map.delete(k);
      return had ? 1 : 0;
    },
    _map: map,
  };
}

describe('checkpointStore Redis G15', () => {
  let store;
  let PlanningRun;
  let originalFindById;
  let originalFindByIdAndUpdate;
  let redis;

  before(() => {
    ({
      saveCheckpoint,
      loadCheckpoint,
      deleteCheckpoint,
      assertCheckpointForResume,
      setRedisClientForTests,
    } = require('../src/checkpoint/checkpointStore'));
    store = {
      saveCheckpoint,
      loadCheckpoint,
      deleteCheckpoint,
      assertCheckpointForResume,
      setRedisClientForTests,
    };
    ({ PlanningRun } = require('../src/run/PlanningRun.model'));
    originalFindById = PlanningRun.findById;
    originalFindByIdAndUpdate = PlanningRun.findByIdAndUpdate;
  });

  beforeEach(() => {
    redis = createMemoryRedis();
    store.setRedisClientForTests(redis);
    PlanningRun.findByIdAndUpdate = async () => ({ lastCheckpointAt: new Date() });
    PlanningRun.findById = () => ({
      select() {
        return {
          lean: async () => ({ snapshotId: 'SNAP-1' }),
        };
      },
    });
  });

  after(() => {
    store.setRedisClientForTests(null);
    PlanningRun.findById = originalFindById;
    PlanningRun.findByIdAndUpdate = originalFindByIdAndUpdate;
  });

  it('normalize via save/load round-trip', async () => {
    const saved = await store.saveCheckpoint('aaaaaaaaaaaaaaaaaaaaaaaa', {
      runId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      snapshotId: 'SNAP-1',
      currentNode: 'feasibility',
      iteration: 3,
      toolResults: [{ toolName: 'stub' }],
      evidence: [{ evidenceId: 'EV-1' }, { evidenceId: 'EV-2' }],
      history: ['understand', 'plan', 'feasibility'],
    });
    assert.equal(saved.state.schemaVersion, 1);
    assert.deepEqual(saved.state.evidenceIds, ['EV-1', 'EV-2']);
    assert.equal(saved.state.currentNode, 'feasibility');

    const loaded = await store.loadCheckpoint('aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.ok(loaded.checkpoint);
    assert.equal(loaded.snapshotId, 'SNAP-1');
    assert.equal(loaded.checkpoint.state.iteration, 3);
    assert.deepEqual(loaded.checkpoint.state.toolResults, [{ toolName: 'stub' }]);
  });

  it('load miss returns checkpoint null', async () => {
    const loaded = await store.loadCheckpoint('bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(loaded.checkpoint, null);
    assert.equal(loaded.snapshotId, 'SNAP-1');
  });

  it('deleteCheckpoint removes key', async () => {
    await store.saveCheckpoint('cccccccccccccccccccccccc', { iteration: 1 });
    await store.deleteCheckpoint('cccccccccccccccccccccccc');
    const loaded = await store.loadCheckpoint('cccccccccccccccccccccccc');
    assert.equal(loaded.checkpoint, null);
  });

  it('assertCheckpointForResume misses without key', async () => {
    await assert.rejects(
      () => store.assertCheckpointForResume('dddddddddddddddddddddddd'),
      (err) => err.code === 'CHECKPOINT_MISSING'
    );
  });

  it('assertCheckpointForResume skips when callback payload', async () => {
    const result = await store.assertCheckpointForResume('eeeeeeeeeeeeeeeeeeeeeeee', {
      hasCallbackPayload: true,
    });
    assert.equal(result.skipped, true);
  });

  it('assertCheckpointForResume passes with saved state', async () => {
    await store.saveCheckpoint('ffffffffffffffffffffffff', {
      iteration: 2,
      currentNode: 'waiting_human',
    });
    const result = await store.assertCheckpointForResume('ffffffffffffffffffffffff');
    assert.equal(result.ok, true);
    assert.equal(result.checkpoint.state.iteration, 2);
  });

  it('g15 key prefix', () => {
    const { g15CheckpointKey, G15_KEY_PREFIX } = require('../src/checkpoint/redisKeys');
    assert.equal(G15_KEY_PREFIX, 'vh:ai-plan:g15:');
    assert.equal(g15CheckpointKey('run1'), 'vh:ai-plan:g15:run1');
  });

  it('schema marks lastCheckpointAt', () => {
    assert.ok(PlanningRun.schema.path('lastCheckpointAt'));
  });
});
