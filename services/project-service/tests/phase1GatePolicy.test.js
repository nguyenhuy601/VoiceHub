/**
 * W0.5 — Tech optional + SoD (T-G1..T-G3 pure helpers).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  GATE_SOD_ERROR,
  isGateSodEnabled,
  assertGateStampSoD,
} = require('../src/utils/phase1GatePolicy');

describe('phase1GatePolicy SoD', () => {
  let prevEnv;

  before(() => {
    prevEnv = process.env.PHASE1_GATE_SOD_ENABLED;
  });

  after(() => {
    if (prevEnv === undefined) delete process.env.PHASE1_GATE_SOD_ENABLED;
    else process.env.PHASE1_GATE_SOD_ENABLED = prevEnv;
  });

  it('SoD enabled by default (T-G3 path)', () => {
    delete process.env.PHASE1_GATE_SOD_ENABLED;
    assert.equal(isGateSodEnabled(), true);
  });

  it('blocks same user restamping prior gate (T-G3)', () => {
    process.env.PHASE1_GATE_SOD_ENABLED = '1';
    assert.throws(
      () =>
        assertGateStampSoD({
          actorUserId: 'u-ba',
          priorStamps: [{ userId: 'u-ba', at: new Date() }],
        }),
      (err) => err.errorCode === GATE_SOD_ERROR && err.statusCode === 403
    );
  });

  it('allows different user after prior stamp', () => {
    process.env.PHASE1_GATE_SOD_ENABLED = '1';
    assert.doesNotThrow(() =>
      assertGateStampSoD({
        actorUserId: 'u-tech',
        priorStamps: [{ userId: 'u-ba', at: new Date() }],
      })
    );
  });

  it('bypass admin skips SoD', () => {
    process.env.PHASE1_GATE_SOD_ENABLED = '1';
    assert.doesNotThrow(() =>
      assertGateStampSoD({
        actorUserId: 'u-ba',
        priorStamps: [{ userId: 'u-ba' }],
        bypass: true,
      })
    );
  });

  it('env PHASE1_GATE_SOD_ENABLED=0 disables SoD', () => {
    process.env.PHASE1_GATE_SOD_ENABLED = '0';
    assert.equal(isGateSodEnabled(), false);
    assert.doesNotThrow(() =>
      assertGateStampSoD({
        actorUserId: 'u-ba',
        priorStamps: [{ userId: 'u-ba' }],
      })
    );
  });
});
