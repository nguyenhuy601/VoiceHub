/**
 * Gate A advisory policy — duplicates / missing sections; approve not blocked.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertRequirementGate1Approve,
  isGateAEnforceEnabled,
} = require('../src/utils/tools/assertRequirementGate1Approve');
const { runGateA } = require('../src/utils/tools/validation/gateA');
const {
  collectGateAAdvisorySignals,
  applyAdvisorySignalsToGateA,
  collectDuplicateSignals,
} = require('../src/utils/tools/gateAAdvisorySignals');
const { createFactStore } = require('../src/utils/tools/factStore');

describe('Gate A advisory signals', () => {
  it('detects duplicate FR ids and titles', () => {
    const pack = {
      functionalRequirements: [
        { externalId: 'FR-1', title: 'Login user' },
        { externalId: 'FR-1', title: 'Other' },
        { externalId: 'FR-2', title: 'Login User' },
      ],
    };
    const dup = collectDuplicateSignals({ pack });
    assert.ok(dup.count >= 2);
    assert.ok(dup.duplicateIds.includes('FR-1'));
  });

  it('collects missing sections from softGaps / NO_DATA reviews', () => {
    const aiAnalysis = {
      analyses: {
        srsProposal: {
          generated: {
            functionalRequirements: { items: [{ id: 'FR-1', title: 'A' }] },
            assumptions: { items: [] },
            businessGoals: { items: [] },
          },
          completeness: {
            sectionReviews: [
              {
                section: 'assumptions',
                coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
              },
            ],
          },
        },
      },
    };
    const signals = collectGateAAdvisorySignals({ pack: {}, aiAnalysis });
    assert.ok(signals.missingSections.length >= 1);
    assert.ok(signals.missingSections.some((s) => s.section === 'assumptions'));
  });

  it('runGateA emits duplicates + missing_sections and skips coverage fail', () => {
    const store = createFactStore([
      { key: 'coverage.weighted', value: 0.1, source: { tool: 'test' } },
      { key: 'consistency.conflictCount', value: 0, source: { tool: 'test' } },
    ]);

    const result = runGateA(
      {
        duplicateCount: 2,
        missingSections: [{ section: 'assumptions', reason: 'NO_DATA' }],
      },
      { factStore: store }
    );

    const data = result.data;
    assert.equal(data.mode, 'advisory');
    assert.equal(data.hasWarnings, true);
    assert.equal(data.passed, false);

    const ids = data.checks.map((c) => c.id);
    assert.ok(ids.includes('duplicates'));
    assert.ok(ids.includes('missing_sections'));
    const cov = data.checks.find((c) => c.id === 'coverage');
    assert.ok(cov);
    assert.equal(cov.skipped, true);
    assert.equal(cov.passed, true);

    const dup = data.checks.find((c) => c.id === 'duplicates');
    assert.equal(dup.passed, false);
    assert.equal(dup.value, 2);
  });

  it('applyAdvisorySignalsToGateA replaces coverage with advisory checks', () => {
    const enriched = applyAdvisorySignalsToGateA(
      {
        passed: false,
        checks: [
          { id: 'coverage', passed: false, value: 0.2, threshold: 0.8 },
          { id: 'consistency', passed: true, value: 0 },
        ],
      },
      {
        duplicateCount: 1,
        missingSections: [{ section: 'scope', reason: 'NO_DATA' }],
        duplicateDetail: { duplicateIds: ['FR-9'] },
      }
    );
    assert.equal(enriched.mode, 'advisory');
    assert.equal(enriched.hasWarnings, true);
    assert.ok(enriched.checks.some((c) => c.id === 'duplicates' && c.passed === false));
    assert.ok(enriched.checks.some((c) => c.id === 'missing_sections' && c.passed === false));
    const cov = enriched.checks.find((c) => c.id === 'coverage');
    assert.ok(cov.skipped);
    assert.equal(cov.passed, true);
  });
});

describe('assertRequirementGate1Approve advisory', () => {
  const basePack = {
    analysisMode: 'manual',
    aiAnalysis: {
      analyses: {
        requirementTools: {
          gateA: {
            mode: 'advisory',
            passed: false,
            hasWarnings: true,
            checks: [
              { id: 'duplicates', passed: false, value: 2 },
              { id: 'missing_sections', passed: false, value: 1 },
              { id: 'coverage', passed: true, skipped: true, value: 0.1 },
            ],
          },
        },
      },
    },
  };

  it('does not throw GATE_A_FAILED when Gate A has warnings (default)', () => {
    assert.equal(isGateAEnforceEnabled(), false);
    const out = assertRequirementGate1Approve({ pack: basePack });
    assert.equal(out.ok, true);
    assert.equal(out.gateAAdvisory, true);
    assert.equal(out.gateAHasWarnings, true);
  });

  it('allows approve when Gate A object missing (advisory)', () => {
    const out = assertRequirementGate1Approve({
      pack: { analysisMode: 'manual', aiAnalysis: { analyses: {} } },
    });
    assert.equal(out.ok, true);
    assert.equal(out.gateAAdvisory, true);
  });

  it('GATE_A_ENFORCE=1 restores hard fail on passed=false', () => {
    const prev = process.env.GATE_A_ENFORCE;
    process.env.GATE_A_ENFORCE = '1';
    try {
      assert.throws(
        () => assertRequirementGate1Approve({ pack: basePack }),
        (err) => err && err.errorCode === 'GATE_A_FAILED'
      );
    } finally {
      if (prev === undefined) delete process.env.GATE_A_ENFORCE;
      else process.env.GATE_A_ENFORCE = prev;
    }
  });
});
