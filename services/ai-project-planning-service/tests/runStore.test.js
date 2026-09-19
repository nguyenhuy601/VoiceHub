const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Run binding unit test without Mongo — exercises createQueuedRun validation +
 * in-memory binding contract used by model.
 */
describe('run binds snapshotId', () => {
  it('createQueuedRun requires snapshotId', async () => {
    // Lazy require avoids mongoose connect at load for pure assertion path
    const { createQueuedRun } = require('../src/run/runStore');
    await assert.rejects(
      () => createQueuedRun({ packId: 'p1' }),
      (err) => err.code === 'SNAPSHOT_REQUIRED'
    );
  });

  it('maps the unique active-run fence to a conflict', async () => {
    const { PlanningRun } = require('../src/run/PlanningRun.model');
    const originalCreate = PlanningRun.create;
    PlanningRun.create = async () => {
      const error = new Error('duplicate');
      error.code = 11000;
      error.keyPattern = { activeKey: 1 };
      throw error;
    };
    try {
      const { createQueuedRun } = require('../src/run/runStore');
      await assert.rejects(
        () =>
          createQueuedRun({
            snapshotId: 'snap-1',
            packId: 'pack-1',
            organizationId: 'org-1',
            job: 'sequencingCpm',
            input: { container: {} },
          }),
        (error) => error.code === 'ACTIVE_RUN_EXISTS'
      );
    } finally {
      PlanningRun.create = originalCreate;
    }
  });

  it('public shape exposes bound snapshotId', () => {
    const { toPublicRun } = require('../src/run/runStore');
    const pub = toPublicRun({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      snapshotId: 'SNAP-BOUND',
      status: 'queued',
      packId: 'pack1',
    });
    assert.equal(pub.snapshotId, 'SNAP-BOUND');
    assert.equal(pub.runId, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(pub.status, 'queued');
  });

  it('marks snapshot identity and execution input immutable in schema', () => {
    const { PlanningRun } = require('../src/run/PlanningRun.model');
    assert.equal(PlanningRun.schema.path('snapshotId').options.immutable, true);
    assert.equal(PlanningRun.schema.path('input').options.immutable, true);
  });

  it('rejects resuming a completed run', async () => {
    const { PlanningRun } = require('../src/run/PlanningRun.model');
    const originalFindById = PlanningRun.findById;
    PlanningRun.findById = async () => ({
      status: 'completed',
      toObject() {
        return this;
      },
    });
    try {
      const { resumeRun } = require('../src/run/runStore');
      await assert.rejects(
        () => resumeRun('aaaaaaaaaaaaaaaaaaaaaaaa'),
        (error) => error.code === 'RESUME_DENIED'
      );
    } finally {
      PlanningRun.findById = originalFindById;
    }
  });
});
