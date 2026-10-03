/**
 * Unit — Gate 1 approve policy (Gate A + forceApprove)
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertRequirementGate1Approve,
  resolveGateAFromPack,
  isRequirementGate1Enabled,
} = require('../src/utils/tools/assertRequirementGate1Approve');

describe('requirementGate1Approve', () => {
  let prevGate1;

  before(() => {
    prevGate1 = process.env.REQUIREMENT_GATE1;
    process.env.REQUIREMENT_GATE1 = '1';
  });

  after(() => {
    if (prevGate1 === undefined) delete process.env.REQUIREMENT_GATE1;
    else process.env.REQUIREMENT_GATE1 = prevGate1;
  });

  it('isRequirementGate1Enabled defaults on', () => {
    assert.equal(isRequirementGate1Enabled(), true);
  });

  it('resolveGateAFromPack reads requirementTools.gateA', () => {
    const gateA = resolveGateAFromPack({
      aiAnalysis: {
        analyses: {
          requirementTools: {
            gateA: { passed: false, checks: [{ id: 'coverage', passed: false }] },
          },
        },
      },
    });
    assert.equal(gateA.passed, false);
    assert.equal(gateA.checks.length, 1);
  });

  it('blocks approve when gateA.passed=false', () => {
    assert.throws(
      () =>
        assertRequirementGate1Approve({
          pack: {
            aiAnalysis: {
              analyses: {
                requirementTools: {
                  gateA: { passed: false, checks: [{ id: 'coverage', passed: false }] },
                },
              },
            },
          },
        }),
      (err) => err.statusCode === 409 && err.errorCode === 'GATE_A_FAILED'
    );
  });

  it('allows forceApprove + overrideReason when gateA fails', () => {
    const result = assertRequirementGate1Approve({
      pack: {
        aiAnalysis: {
          analyses: {
            requirementTools: {
              gateA: { passed: false, checks: [{ id: 'coverage', passed: false }] },
            },
          },
        },
      },
      forceApprove: true,
      overrideReason: 'Accepted residual coverage risk for MVP',
    });
    assert.equal(result.ok, true);
    assert.equal(result.override.forceApprove, true);
    assert.match(result.override.reason, /MVP/);
  });

  it('forceApprove without reason fails 400', () => {
    assert.throws(
      () =>
        assertRequirementGate1Approve({
          pack: {
            aiAnalysis: {
              analyses: {
                requirementTools: { gateA: { passed: false, checks: [] } },
              },
            },
          },
          forceApprove: true,
          overrideReason: '  ',
        }),
      (err) => err.statusCode === 400 && err.errorCode === 'GATE_A_OVERRIDE_REASON_REQUIRED'
    );
  });

  it('passes when gateA.passed=true without force', () => {
    const result = assertRequirementGate1Approve({
      pack: {
        aiAnalysis: {
          analyses: {
            requirementTools: { gateA: { passed: true, checks: [] } },
          },
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.override, null);
  });

  it('blocks when gateA missing', () => {
    assert.throws(
      () => assertRequirementGate1Approve({ pack: { aiAnalysis: { analyses: {} } } }),
      (err) => err.statusCode === 409 && err.errorCode === 'GATE_A_MISSING'
    );
  });
});
