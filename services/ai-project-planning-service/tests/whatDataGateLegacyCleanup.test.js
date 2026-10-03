const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MONGO =
  process.env.MONGODB_URI_TEST ||
  process.env.AI_PLANNING_MONGO_URI ||
  process.env.MONGODB_URI ||
  '';

describe('legacy data_gate cleanup (RULE-R07)', () => {
  let cancelRun;
  let createQueuedRun;
  let findActiveRun;
  let PlanningRun;
  let connected = false;

  before(async () => {
    if (!MONGO) return;
    try {
      await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 3000 });
      connected = true;
      ({ cancelRun, createQueuedRun, findActiveRun } = require('../src/run/runStore'));
      ({ PlanningRun } = require('../src/run/PlanningRun.model'));
    } catch {
      connected = false;
    }
  });

  after(async () => {
    if (connected) await mongoose.disconnect().catch(() => {});
  });

  it('cancelRun on waiting_human:data_review releases activeKey', async (t) => {
    if (!connected) {
      t.skip('Mongo not available');
      return;
    }
    const packId = `pack-legacy-dg-${Date.now()}`;
    const job = 'phase_what';
    const doc = await PlanningRun.create({
      projectId: null,
      packId,
      organizationId: 'org-test',
      snapshotId: `snap-${Date.now()}`,
      job,
      activeKey: `${packId}|${job}`,
      status: 'waiting_human',
      gate: 'data_review',
      currentNode: 'gate:data_review',
      pipelineStep: 2,
      pipelineSubstep: 'gate_preview',
    });
    const cancelled = await cancelRun(String(doc._id));
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.activeKey, undefined);
    const stillActive = await findActiveRun({ packId, job });
    assert.equal(stillActive, null);

    const next = await createQueuedRun({
      packId,
      organizationId: 'org-test',
      snapshotId: `snap-next-${Date.now()}`,
      job,
      trigger: 'force_rerun',
    });
    assert.equal(next.status, 'queued');
    assert.ok(next.activeKey);
    await PlanningRun.deleteMany({ packId });
  });

  it('createQueuedRun auto-cancels legacy data_review when activeKey conflicts', async (t) => {
    if (!connected) {
      t.skip('Mongo not available');
      return;
    }
    const packId = `pack-legacy-conflict-${Date.now()}`;
    const job = 'phase_what';
    await PlanningRun.create({
      packId,
      organizationId: 'org-test',
      snapshotId: `snap-old-${Date.now()}`,
      job,
      activeKey: `${packId}|${job}`,
      status: 'waiting_human',
      gate: 'data_review',
    });
    const next = await createQueuedRun({
      packId,
      organizationId: 'org-test',
      snapshotId: `snap-new-${Date.now()}`,
      job,
      trigger: 'phase_run',
    });
    assert.equal(next.status, 'queued');
    assert.equal(String(next.gate || ''), '');
    const legacy = await PlanningRun.find({
      packId,
      status: 'cancelled',
      gate: 'data_review',
    }).lean();
    // gate may be cleared on cancel; at least one cancelled exists
    const cancelledCount = await PlanningRun.countDocuments({
      packId,
      status: 'cancelled',
    });
    assert.ok(cancelledCount >= 1);
    assert.ok(next.activeKey);
    await PlanningRun.deleteMany({ packId });
  });
});
