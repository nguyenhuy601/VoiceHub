const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  IMPORT_SET_ERROR_CODES,
  computeRetention,
  planSetTransition,
  assertCanPublish,
  RETENTION_DAYS,
} = require('../src/constants/analysisImportSet');

describe('analysisImportSetGate', () => {
  it('computeRetention returns purgeAfterAt and days left', () => {
    const trashedAt = new Date('2026-01-01T00:00:00.000Z');
    const { purgeAfterAt, retentionDaysLeft } = computeRetention(trashedAt, 30);
    assert.ok(purgeAfterAt instanceof Date);
    assert.equal(
      purgeAfterAt.toISOString(),
      new Date(trashedAt.getTime() + 30 * 86400000).toISOString()
    );
    assert.equal(typeof retentionDaysLeft, 'number');
    assert.ok(retentionDaysLeft >= 0);
    assert.equal(RETENTION_DAYS >= 1, true);
  });

  it('planSetTransition enforces BA before Tech before PO', () => {
    const pending = { status: 'pending_review', review: { ba: {}, tech: {}, po: {} } };
    const baStep = planSetTransition(pending, 'tech_review');
    assert.equal(baStep.to, 'tech_review');
    assert.equal(baStep.permission, 'analysis:ba_review');

    const afterBa = {
      status: 'pending_review',
      review: { ba: { userId: 'u1', at: new Date() }, tech: {}, po: {} },
    };
    const techStep = planSetTransition(afterBa, 'po_review');
    assert.equal(techStep.to, 'po_review');

    assert.throws(
      () => planSetTransition(pending, 'po_review'),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.TRANSITION_DENIED
    );
  });

  it('allows republish when PO already stamped but set still pending_review', () => {
    const stalled = {
      status: 'pending_review',
      review: {
        ba: { userId: 'a', at: new Date() },
        tech: { userId: 'b', at: new Date() },
        po: { userId: 'c', at: new Date() },
      },
    };
    const step = planSetTransition(stalled, 'approved');
    assert.equal(step.publish, true);
    assert.equal(step.republish, true);
  });

  it('assertCanPublish requires BA+PO; Tech only when techRequired', () => {
    assert.throws(
      () =>
        assertCanPublish({
          status: 'pending_review',
          review: { ba: { userId: 'a', at: new Date() }, tech: {}, po: {} },
        }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.PUBLISH_DENIED
    );
    assert.doesNotThrow(() =>
      assertCanPublish(
        {
          status: 'pending_review',
          review: {
            ba: { userId: 'a', at: new Date() },
            tech: {},
            po: { userId: 'c', at: new Date() },
          },
        },
        { techRequired: false }
      )
    );
    assert.doesNotThrow(() =>
      assertCanPublish({
        status: 'pending_review',
        review: {
          ba: { userId: 'a', at: new Date() },
          tech: { userId: 'b', at: new Date() },
          po: { userId: 'c', at: new Date() },
        },
      })
    );
  });

  it('planSetTransition allows PO approved after BA when tech skipped', () => {
    const afterBa = {
      status: 'pending_review',
      review: { ba: { userId: 'u1', at: new Date() }, tech: { skipped: true }, po: {} },
    };
    const step = planSetTransition(afterBa, 'approved', { techRequired: false });
    assert.equal(step.to, 'approved');
    assert.equal(step.permission, 'analysis:po_review');
  });

  it('reject permission follows current Import Set gate', () => {
    const pending = { status: 'pending_review', review: { ba: {}, tech: {}, po: {} } };
    assert.equal(planSetTransition(pending, 'rejected').permission, 'analysis:ba_review');

    const afterBa = {
      status: 'pending_review',
      review: { ba: { userId: 'u1', at: new Date() }, tech: {}, po: {} },
    };
    assert.equal(planSetTransition(afterBa, 'rejected').permission, 'analysis:tech_review');

    const afterTech = {
      status: 'pending_review',
      review: {
        ba: { userId: 'u1', at: new Date() },
        tech: { userId: 'u2', at: new Date() },
        po: {},
      },
    };
    assert.equal(planSetTransition(afterTech, 'rejected').permission, 'analysis:po_review');
  });

  it('planArtifactQueueAfterSetGate opens Tech/PO queues after BA set stamp', () => {
    const {
      planArtifactQueueAfterSetGate,
    } = require('../src/constants/analysisImportSet');
    assert.equal(
      planArtifactQueueAfterSetGate({ setGateTo: 'tech_review', techRequired: true }),
      'tech_review'
    );
    assert.equal(
      planArtifactQueueAfterSetGate({ setGateTo: 'tech_review', techRequired: false }),
      'po_review'
    );
    assert.equal(planArtifactQueueAfterSetGate({ setGateTo: 'po_review' }), null);
    assert.equal(planArtifactQueueAfterSetGate({ setGateTo: 'approved' }), null);
  });
});
