/**
 * Unit — pre-approval validation
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  runPreApprovalValidation,
} = require('../../src/utils/tools/runPreApprovalValidation');

describe('preApprovalValidation', () => {
  it('fails when gateA.passed=false', () => {
    const result = runPreApprovalValidation({
      overview: { requirementName: 'P' },
      sourceFileName: 'a.xlsx',
      functionalRequirements: [{ externalId: 'FR-1' }],
      aiAnalysis: {
        analyses: {
          requirementTools: {
            facts: {
              'coverage.weighted': 0.5,
              'coverage.passed': false,
              'completeness.score': 0.4,
              'consistency.conflictCount': 1,
            },
            gateA: { passed: false, checks: [{ id: 'coverage', passed: false }] },
          },
          requirementInsights: { schemaVersion: 'requirementInsights.v1' },
          proposedSrs: { schemaVersion: 'proposedSrs.v1' },
        },
      },
    });
    assert.equal(result.passed, false);
    const gateCheck = result.checks.find((c) => c.id === 'gateA');
    assert.equal(gateCheck.passed, false);
  });

  it('passes when gateA and schema ok', () => {
    const result = runPreApprovalValidation({
      overview: { requirementName: 'P' },
      sourceFileId: 'abc',
      functionalRequirements: [{ externalId: 'FR-1' }],
      aiAnalysis: {
        analyses: {
          requirementTools: {
            facts: {
              'coverage.weighted': 0.9,
              'coverage.passed': true,
              'completeness.score': 0.8,
              'consistency.conflictCount': 0,
              'trace.danglingCount': 0,
              'trace.orphanCount': 0,
            },
            gateA: { passed: true, checks: [] },
          },
          requirementInsights: { schemaVersion: 'requirementInsights.v1' },
          proposedSrs: { schemaVersion: 'proposedSrs.v1', deltas: [] },
        },
      },
    });
    assert.equal(result.passed, true);
  });
});
