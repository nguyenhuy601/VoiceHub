const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertGate1ConflictAmbiguityOrOverride,
  resolveConflictAmbiguityFromPack,
} = require('../src/utils/tools/assertGate1ConflictAmbiguityOrOverride');
const {
  assertRequirementGate1Approve,
} = require('../src/utils/tools/assertRequirementGate1Approve');

describe('assertGate1ConflictAmbiguityOrOverride Track A', () => {
  it('blocks when g4 gate failed', () => {
    assert.throws(
      () =>
        assertGate1ConflictAmbiguityOrOverride({
          pack: {
            aiAnalysis: {
              analyses: {
                g4Understanding: {
                  conflictAmbiguityGate: {
                    passed: false,
                    blocking: [{ blockKind: 'ambiguity', message: 'vague' }],
                  },
                },
              },
            },
          },
          env: { GATE1_CONFLICT_AMBIGUITY_ENFORCE: '1' },
        }),
      (err) => err.errorCode === 'CONFLICT_AMBIGUITY_BLOCKING'
    );
  });

  it('allows force with reason', () => {
    const out = assertGate1ConflictAmbiguityOrOverride({
      pack: {
        aiAnalysis: {
          analyses: {
            g4Understanding: {
              conflictAmbiguityGate: {
                passed: false,
                blocking: [{ blockKind: 'conflict' }],
              },
            },
          },
        },
      },
      forceApprove: true,
      overrideReason: 'PO accepts residual ambiguity',
      env: { GATE1_CONFLICT_AMBIGUITY_ENFORCE: '1' },
    });
    assert.equal(out.ok, true);
    assert.ok(out.override.reason.includes('residual'));
  });

  it('resolves from phase_what', () => {
    const gate = resolveConflictAmbiguityFromPack({
      aiAnalysis: {
        phaseRuns: {
          phase_what: {
            conflictAmbiguityGate: { passed: true, blocking: [] },
          },
        },
      },
    });
    assert.equal(gate.passed, true);
  });
});

describe('assertRequirementGate1Approve integrates conflict gate', () => {
  it('blocks G4 path when conflictAmbiguityGate failed', () => {
    const prevWhat = process.env.WHAT_G4_ENABLED;
    process.env.WHAT_G4_ENABLED = '1';
    try {
      assert.throws(
        () =>
          assertRequirementGate1Approve({
            pack: {
              analysisMode: 'ai',
              aiAnalysis: {
                analyses: {
                  g4Understanding: {
                    requirements: [{ id: 'FR-1' }],
                    conflictAmbiguityGate: {
                      passed: false,
                      blocking: [{ blockKind: 'ambiguity' }],
                    },
                    meta: {},
                  },
                },
                phaseRuns: { phase_what: { status: 'ready', mode: 'g4' } },
              },
            },
            forceApprove: false,
          }),
        (err) => err.errorCode === 'CONFLICT_AMBIGUITY_BLOCKING'
      );
    } finally {
      if (prevWhat === undefined) delete process.env.WHAT_G4_ENABLED;
      else process.env.WHAT_G4_ENABLED = prevWhat;
    }
  });
});
