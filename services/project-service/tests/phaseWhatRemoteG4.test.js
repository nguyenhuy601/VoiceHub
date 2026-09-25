const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isWhatG4Enabled,
  assertWhatJobDeprecatedForG4,
  markPhaseWhatGate1Approved,
  applyG4UnderstandingToContainer,
  hasReadyG4Understanding,
} = require('../src/utils/aiAnalysis/whatG4Policy');
const { materializeG4IntoPack } = require('../src/utils/aiAnalysis/materializeG4IntoPack');
const {
  assertG4ReadyForGate1,
  assertRequirementGate1Approve,
} = require('../src/utils/tools/assertRequirementGate1Approve');

describe('whatG4Policy', () => {
  it('isWhatG4Enabled defaults on', () => {
    assert.equal(isWhatG4Enabled({}), true);
    assert.equal(isWhatG4Enabled({ WHAT_G4_ENABLED: '0' }), false);
  });

  it('assertWhatJobDeprecatedForG4 throws for WHAT jobs', () => {
    assert.throws(
      () => assertWhatJobDeprecatedForG4('hierarchyDecomposition', { env: {} }),
      (err) => err.errorCode === 'WHAT_JOB_DEPRECATED_USE_G4' && err.statusCode === 409
    );
    assert.doesNotThrow(() =>
      assertWhatJobDeprecatedForG4('wbsGeneration', { env: {} })
    );
    assert.doesNotThrow(() =>
      assertWhatJobDeprecatedForG4('hierarchyDecomposition', {
        env: { WHAT_G4_ENABLED: '0' },
      })
    );
  });

  it('markPhaseWhatGate1Approved sets phase_what.gate1 without jobs', () => {
    const next = markPhaseWhatGate1Approved(
      { jobs: { hierarchyDecomposition: { status: 'pending' } } },
      { source: 'g4_gate1', at: '2026-01-01T00:00:00.000Z' }
    );
    assert.equal(next.jobs, undefined);
    assert.equal(next.phaseRuns.phase_what.gate1, 'approved');
    assert.equal(next.phaseRuns.phase_what.status, 'ready');
    assert.equal(next.phaseRuns.phase_what.source, 'g4_gate1');
    assert.equal(next.phaseRuns.phase_what.confirmedAt, '2026-01-01T00:00:00.000Z');
  });

  it('applyG4UnderstandingToContainer writes analyses + phase_what', () => {
    const g4 = {
      requirements: [{ id: 'FR-1' }],
      relationships: [],
      ambiguities: [],
      assumptions: [],
      evidence: [],
      meta: { durationMs: 12 },
    };
    const next = applyG4UnderstandingToContainer({}, g4, {
      remoteRunId: 'run1',
      snapshotId: 'snap1',
    });
    assert.deepEqual(next.analyses.g4Understanding.requirements, [{ id: 'FR-1' }]);
    assert.equal(next.phaseRuns.phase_what.status, 'ready');
    assert.equal(next.phaseRuns.phase_what.mode, 'g4');
    assert.equal(hasReadyG4Understanding(next), true);
  });

  it('materializeG4IntoPack seeds empty FR list', () => {
    const { pack, meta } = materializeG4IntoPack(
      { functionalRequirements: [] },
      {
        requirements: [
          { id: 'FR-1', title: 'Login', description: 'User logs in' },
        ],
      }
    );
    assert.equal(meta.seededFr, 1);
    assert.equal(pack.functionalRequirements[0].externalId, 'FR-1');
  });

  it('assertG4ReadyForGate1 blocks AI pack without G4', () => {
    assert.throws(
      () =>
        assertG4ReadyForGate1({
          pack: {
            analysisMode: 'ai',
            aiAnalysis: { phaseRuns: { phase_what: { mode: 'g4', status: 'pending' } } },
          },
        }),
      (err) => err.errorCode === 'G4_UNDERSTANDING_MISSING'
    );
  });

  it('assertRequirementGate1Approve allows G4-ready pack without GateA', () => {
    const pack = {
      analysisMode: 'ai',
      aiAnalysis: {
        phaseRuns: { phase_what: { mode: 'g4', status: 'ready' } },
        analyses: {
          g4Understanding: {
            requirements: [{ id: 'FR-1' }],
            relationships: [],
            ambiguities: [],
            assumptions: [],
            evidence: [],
          },
        },
      },
    };
    const out = assertRequirementGate1Approve({ pack });
    assert.equal(out.ok, true);
    assert.equal(out.g4, true);
  });
});
