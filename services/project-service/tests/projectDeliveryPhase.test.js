const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DELIVERY_PHASES,
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  canTransitionDeliveryPhase,
  DEFAULT_DELIVERY_PHASE_EXISTING,
  DEFAULT_DELIVERY_PHASE_NEW,
  DEVELOPMENT_MODULES,
} = require('../src/constants/projectDeliveryPhase');

describe('projectDeliveryPhase', () => {
  it('lists five delivery phases', () => {
    assert.equal(DELIVERY_PHASES.length, 5);
    assert.ok(DELIVERY_PHASES.includes('requirement_analysis'));
    assert.ok(DELIVERY_PHASES.includes('development'));
  });

  it('coerces missing to development for existing docs', () => {
    assert.equal(coerceDeliveryPhase(''), DEFAULT_DELIVERY_PHASE_EXISTING);
    assert.equal(coerceDeliveryPhase(null), DEFAULT_DELIVERY_PHASE_EXISTING);
  });

  it('coerces empty with missingAsExisting false to new default', () => {
    assert.equal(
      coerceDeliveryPhase('', { missingAsExisting: false }),
      DEFAULT_DELIVERY_PHASE_NEW
    );
  });

  it('rejects unknown phase', () => {
    assert.equal(coerceDeliveryPhase('nope'), null);
  });

  it('development allows board; requirement_analysis does not', () => {
    assert.equal(isModuleAllowedForPhase('board', 'development'), true);
    assert.equal(isModuleAllowedForPhase('board', 'requirement_analysis'), false);
    assert.equal(isModuleAllowedForPhase('analysis-fr', 'requirement_analysis'), true);
  });

  it('development modules include legacy suite keys', () => {
    assert.ok(DEVELOPMENT_MODULES.includes('change-requests'));
    assert.ok(DEVELOPMENT_MODULES.includes('requirements'));
  });

  it('allows adjacent transitions', () => {
    assert.equal(
      canTransitionDeliveryPhase('requirement_analysis', 'delivery_planning'),
      true
    );
    assert.equal(canTransitionDeliveryPhase('development', 'qa_uat'), true);
    assert.equal(canTransitionDeliveryPhase('requirement_analysis', 'qa_uat'), false);
  });
});
