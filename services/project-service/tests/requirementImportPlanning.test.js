const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pickPlanningReadinessSummary,
  assertPreviewReadyForImport,
} = require('../src/utils/requirementPlanningReadiness');

function packPayload(functionalRequirements = [], overview = {}) {
  return {
    overview,
    functionalRequirements,
    staffingPlan: {},
  };
}

function staffedLeaf(overrides = {}) {
  return {
    externalId: 'FR-001',
    level: 'Task',
    name: 'Login',
    suggestedSkills: ['React'],
    estimateHours: 8,
    suggestedRoleKey: 'frontend_developer',
    ...overrides,
  };
}

describe('requirementImportPlanning', () => {
  it('pickPlanningReadinessSummary returns staffed pack summary', () => {
    const summary = pickPlanningReadinessSummary(packPayload([staffedLeaf()]));
    assert.equal(summary.allLeavesStaffed, true);
    assert.equal(summary.leafCount, 1);
    assert.equal(summary.missingLeafIds.length, 0);
    assert.ok(summary.score >= 60);
  });

  it('pickPlanningReadinessSummary flags zero execution leaves', () => {
    const summary = pickPlanningReadinessSummary(
      packPayload([{ externalId: 'M-1', level: 'Epic', name: 'Auth epic' }])
    );
    assert.equal(summary.allLeavesStaffed, false);
    assert.equal(summary.leafCount, 0);
  });

  it('assertPreviewReadyForImport passes when all leaves staffed', () => {
    const readiness = assertPreviewReadyForImport(packPayload([staffedLeaf()]));
    assert.equal(readiness.allLeavesStaffed, true);
  });

  it('assertPreviewReadyForImport throws 422 when leaf staffing incomplete', () => {
    assert.throws(
      () =>
        assertPreviewReadyForImport(
          packPayload([
            staffedLeaf({ suggestedSkills: [], estimateHours: null, suggestedRoleKey: '' }),
          ])
        ),
      (err) =>
        err.statusCode === 422 &&
        err.errorCode === 'REQ_IMPORT_STAFFING_INCOMPLETE' &&
        Array.isArray(err.details?.missingLeafIds) &&
        err.details.missingLeafIds.length > 0
    );
  });

  it('assertPreviewReadyForImport throws 422 when no execution leaves', () => {
    assert.throws(
      () =>
        assertPreviewReadyForImport(
          packPayload([{ externalId: 'M-1', level: 'Epic', name: 'Only epic' }])
        ),
      (err) => err.errorCode === 'REQ_IMPORT_STAFFING_INCOMPLETE' && err.details.allLeavesStaffed === false
    );
  });
});
