const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  coerceProjectLifecycleStatus,
  statusForDeliveryPhase,
  alignedLifecycleFields,
  PROJECT_STATUSES,
} = require('../src/utils/project/projectInitFields');
const { isProjectClosedStatus } = require('../src/utils/project/projectCloseGate');

describe('coerceProjectLifecycleStatus', () => {
  it('keeps current enum values', () => {
    for (const st of PROJECT_STATUSES) {
      assert.equal(coerceProjectLifecycleStatus(st), st);
    }
  });

  it('maps legacy terminals to closed', () => {
    assert.equal(coerceProjectLifecycleStatus('cancelled'), 'closed');
    assert.equal(coerceProjectLifecycleStatus('canceled'), 'closed');
    assert.equal(coerceProjectLifecycleStatus('completed'), 'closed');
    assert.equal(coerceProjectLifecycleStatus('archived'), 'closed');
  });

  it('maps aliases: ready_for_planning → ready, planning/new/created → draft', () => {
    assert.equal(coerceProjectLifecycleStatus('draft'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('new'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('created'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('ready_for_planning'), 'ready');
    assert.equal(coerceProjectLifecycleStatus('planning'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('active'), 'in_development');
  });

  it('returns null for unknown', () => {
    assert.equal(coerceProjectLifecycleStatus('nope'), null);
    assert.equal(coerceProjectLifecycleStatus(''), null);
  });
});

describe('statusForDeliveryPhase', () => {
  it('maps one status per delivery phase', () => {
    assert.equal(statusForDeliveryPhase('requirement_analysis'), 'draft');
    assert.equal(statusForDeliveryPhase('delivery_planning'), 'ready');
    assert.equal(statusForDeliveryPhase('development'), 'in_development');
    assert.equal(statusForDeliveryPhase('qa_uat'), 'qa_uat');
    assert.equal(statusForDeliveryPhase('release_handover'), 'release_handover');
    assert.equal(statusForDeliveryPhase('requirement_analysis') === 'ready', false);
    assert.equal(statusForDeliveryPhase(''), null);
  });
});
describe('alignedLifecycleFields', () => {
  it('maps an empty phase to development', () => {
    assert.deepEqual(alignedLifecycleFields({ status: 'draft', deliveryPhase: '' }), {
      status: 'in_development',
      deliveryPhase: 'development',
    });
    assert.deepEqual(alignedLifecycleFields({ status: 'draft', deliveryPhase: null }), {
      status: 'in_development',
      deliveryPhase: 'development',
    });
  });

  it('keeps on_hold even when the phase would map to another status', () => {
    assert.deepEqual(alignedLifecycleFields({ status: 'on_hold', deliveryPhase: 'qa_uat' }), {
      status: 'on_hold',
      deliveryPhase: 'qa_uat',
    });
  });

  it('keeps closed and does not invent a phase', () => {
    assert.deepEqual(alignedLifecycleFields({ status: 'closed', deliveryPhase: '' }), {
      status: 'closed',
      deliveryPhase: null,
    });
    assert.deepEqual(alignedLifecycleFields({ status: 'cancelled', deliveryPhase: null }), {
      status: 'closed',
      deliveryPhase: null,
    });
  });

  it('leaves requirement analysis as draft', () => {
    assert.deepEqual(
      alignedLifecycleFields({ status: 'draft', deliveryPhase: 'requirement_analysis' }),
      { status: 'draft', deliveryPhase: 'requirement_analysis' }
    );
  });

  it('rejects a draft status when the phase is already development', () => {
    assert.deepEqual(
      alignedLifecycleFields({ status: 'draft', deliveryPhase: 'development' }),
      { status: 'in_development', deliveryPhase: 'development' }
    );
  });
});

describe('isProjectClosedStatus', () => {
  it('treats legacy cancelled as closed', () => {
    assert.equal(isProjectClosedStatus('closed'), true);
    assert.equal(isProjectClosedStatus('cancelled'), true);
    assert.equal(isProjectClosedStatus('in_development'), false);
  });
});
