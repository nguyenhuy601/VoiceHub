const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertGate2FeasibilityOrOverride,
  resolveFeasibilityFromPack,
} = require('../src/utils/tools/assertGate2FeasibilityOrOverride');

describe('assertGate2FeasibilityOrOverride Track C', () => {
  it('resolves feasibility from phase_how', () => {
    const feas = resolveFeasibilityFromPack({
      aiAnalysis: {
        phaseRuns: {
          phase_how: {
            status: 'confirmed',
            feasibility: { pass: true, failures: [] },
          },
        },
      },
    });
    assert.equal(feas.pass, true);
    assert.equal(feas.source, 'phaseRuns.phase_how.feasibility');
  });

  it('blocks promote when G13 fail without force', () => {
    assert.throws(
      () =>
        assertGate2FeasibilityOrOverride({
          pack: {
            aiAnalysis: {
              phaseRuns: {
                phase_how: {
                  status: 'confirmed',
                  feasibility: {
                    pass: false,
                    failures: [{ code: 'FEAS_RESOURCE' }],
                  },
                },
              },
            },
          },
          forceApprove: false,
          env: { GATE2_FEASIBILITY_ENFORCE: '1' },
        }),
      (err) => err.errorCode === 'G13_FEASIBILITY_FAILED' && err.statusCode === 409
    );
  });

  it('requires overrideReason when force on G13 fail', () => {
    assert.throws(
      () =>
        assertGate2FeasibilityOrOverride({
          pack: {
            aiAnalysis: {
              phaseRuns: {
                phase_how: {
                  feasibility: { pass: false, failures: [] },
                },
              },
            },
          },
          forceApprove: true,
          overrideReason: '',
          env: { GATE2_FEASIBILITY_ENFORCE: '1' },
        }),
      (err) => err.errorCode === 'G13_OVERRIDE_REASON_REQUIRED'
    );
  });

  it('allows force with reason and returns override audit payload', () => {
    const out = assertGate2FeasibilityOrOverride({
      pack: {
        aiAnalysis: {
          phaseRuns: {
            phase_how: {
              feasibility: {
                pass: false,
                failures: [{ code: 'FEAS_SCHEDULE' }],
              },
            },
          },
        },
      },
      forceApprove: true,
      overrideReason: 'PO accepted residual schedule risk',
      env: { GATE2_FEASIBILITY_ENFORCE: '1' },
    });
    assert.equal(out.ok, true);
    assert.equal(out.override.forceApprove, true);
    assert.ok(out.override.reason.includes('residual'));
  });

  it('high confidence on pack does not appear as pass substitute', () => {
    // Feasibility object is SoT; confidence fields on analyses ignored by resolve
    const feas = resolveFeasibilityFromPack({
      aiAnalysis: {
        analyses: { confidence: 0.99 },
        phaseRuns: {
          phase_how: {
            feasibility: { pass: false, failures: [{ code: 'FEAS_COVERAGE' }] },
          },
        },
      },
    });
    assert.equal(feas.pass, false);
  });
});
