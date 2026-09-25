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

describe('checkpoint pinned inputs (RULE-G15-PIN)', () => {
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
          lean: async () => ({ snapshotId: 'SNAP-PIN' }),
        };
      },
    });
  });

  after(() => {
    setRedisClientForTests(null);
    PlanningRun.findById = originalFindById;
    PlanningRun.findByIdAndUpdate = originalFindByIdAndUpdate;
  });

  it('normalizeAgentState keeps slim toolData pack container corpus + seek index', () => {
    const state = normalizeAgentState({
      toolData: {
        employees: [{ userId: 'u1' }],
        calendar: { holidays: ['2026-09-02'] },
      },
      pack: {
        overview: { startDate: '2026-01-01' },
        secretNoise: 'drop-me',
      },
      container: {
        planning: { tasks: [{ id: 'T1' }] },
        jobs: { legacy: true },
      },
      corpus: [{ id: 'D1', text: 'hello' }],
      currentToolIndex: 3,
      currentToolName: 'EffortTool',
    });
    assert.equal(state.toolData.employees[0].userId, 'u1');
    assert.deepEqual(state.toolData.calendar.holidays, ['2026-09-02']);
    assert.equal(state.pack.overview.startDate, '2026-01-01');
    assert.equal(state.pack.secretNoise, undefined);
    assert.equal(state.container.planning.tasks[0].id, 'T1');
    assert.equal(state.container.jobs, undefined);
    assert.equal(state.corpus[0].id, 'D1');
    assert.equal(state.currentToolIndex, 3);
    assert.equal(state.currentToolName, 'EffortTool');
  });

  it('saveCheckpoint → loadCheckpoint preserves employees and container.planning', async () => {
    const runId = 'eeeeeeeeeeeeeeeeeeeeeeee';
    await saveCheckpoint(runId, {
      job: 'phase_how',
      snapshotId: 'SNAP-PIN',
      toolData: { employees: [{ userId: 'u9', skills: ['React'] }] },
      pack: { overview: { startDate: '2026-02-01' } },
      container: { planning: { tasks: [{ id: 'A', effortHours: 8 }] } },
      corpus: [{ id: 'C1', text: 'capacity' }],
      currentToolIndex: 2,
      currentToolName: 'WbsTool',
    });
    const loaded = await loadCheckpoint(runId);
    assert.ok(loaded.checkpoint);
    const s = loaded.checkpoint.state;
    assert.equal(s.toolData.employees[0].userId, 'u9');
    assert.equal(s.container.planning.tasks[0].id, 'A');
    assert.equal(s.pack.overview.startDate, '2026-02-01');
    assert.equal(s.corpus[0].id, 'C1');
    assert.equal(s.currentToolIndex, 2);
    assert.equal(s.currentToolName, 'WbsTool');
  });
});
