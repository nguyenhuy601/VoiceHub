const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAgentState } = require('../src/checkpoint/agentStateSchema');

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
      return map.delete(String(key)) ? 1 : 0;
    },
  };
}

describe('checkpoint selectiveReplanSteps round-trip', () => {
  let saveCheckpoint;
  let loadCheckpoint;
  let setRedisClientForTests;
  let PlanningRun;
  let originalFindById;
  let originalFindByIdAndUpdate;

  before(() => {
    ({
      saveCheckpoint,
      loadCheckpoint,
      setRedisClientForTests,
    } = require('../src/checkpoint/checkpointStore'));
    ({ PlanningRun } = require('../src/run/PlanningRun.model'));
    originalFindById = PlanningRun.findById;
    originalFindByIdAndUpdate = PlanningRun.findByIdAndUpdate;
  });

  beforeEach(() => {
    setRedisClientForTests(createMemoryRedis());
    PlanningRun.findByIdAndUpdate = async () => ({ lastCheckpointAt: new Date() });
    PlanningRun.findById = () => ({
      select() {
        return {
          lean: async () => ({ snapshotId: 'SNAP-SEL' }),
        };
      },
    });
  });

  after(() => {
    setRedisClientForTests(null);
    PlanningRun.findById = originalFindById;
    PlanningRun.findByIdAndUpdate = originalFindByIdAndUpdate;
  });

  it('normalizeAgentState keeps selectiveReplanSteps', () => {
    const state = normalizeAgentState({
      selectiveReplanSteps: ['EffortTool', 'ScheduleTool', ''],
      status: 'replanning',
    });
    assert.deepEqual(state.selectiveReplanSteps, ['EffortTool', 'ScheduleTool']);
  });

  it('saveCheckpoint → loadCheckpoint preserves selectiveReplanSteps', async () => {
    const runId = 'dddddddddddddddddddddddd';
    await saveCheckpoint(runId, {
      job: 'phase_how',
      snapshotId: 'SNAP-SEL',
      status: 'replanning',
      selectiveReplanSteps: ['EffortTool', 'EmployeeMatchingTool'],
    });
    const loaded = await loadCheckpoint(runId);
    assert.ok(loaded.checkpoint);
    assert.deepEqual(loaded.checkpoint.state.selectiveReplanSteps, [
      'EffortTool',
      'EmployeeMatchingTool',
    ]);
  });
});
