/**
 * Hierarchy proposal merge into functionalRequirements.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  allocateFrExternalId,
  mergeHierarchyProposalsIntoFrList,
} = require('../src/utils/aiAnalysis/aiAnalysisHierarchyMerge');
const { buildRequirementFrSlices } = require('../src/utils/aiAnalysis/aiAnalysisFrSlice');

describe('aiAnalysisHierarchyMerge', () => {
  it('allocateFrExternalId returns unique FR-### ids', () => {
    const id1 = allocateFrExternalId(['FR-001', 'FR-002'], 'FR');
    assert.equal(id1, 'FR-003');
    const id2 = allocateFrExternalId([], 'FR');
    assert.equal(id2, 'FR-001');
  });

  it('merges Feature and Requirement with valid parents and unique ids', () => {
    const frList = [
      {
        externalId: 'FR-001',
        level: 'Module',
        parentExternalId: '',
        name: 'Auth',
      },
      {
        externalId: 'FR-010',
        level: 'Feature',
        parentExternalId: 'FR-001',
        name: 'Login',
        moduleLabel: 'Auth',
      },
    ];

    const { frList: merged, addedCount, addedIds } = mergeHierarchyProposalsIntoFrList(
      frList,
      {
        proposedFeatures: [
          {
            proposalId: 'PROP-F-FR-001-1',
            parentExternalId: 'FR-001',
            level: 'Feature',
            name: 'SSO',
            status: 'accepted',
            source: 'heuristic',
          },
        ],
        proposedRequirements: [
          {
            proposalId: 'PROP-R-FR-010-1',
            parentExternalId: 'FR-010',
            level: 'Requirement',
            name: 'Password login',
            status: 'accepted',
            source: 'heuristic',
          },
        ],
      }
    );

    assert.equal(addedCount, 2);
    assert.equal(addedIds.length, 2);
    assert.ok(addedIds.every((id) => /^FR-\d{3}$/.test(id)));
    assert.ok(!addedIds.includes('FR-001'));
    assert.ok(!addedIds.includes('FR-010'));

    const sso = merged.find((r) => r.name === 'SSO');
    assert.equal(sso.level, 'Feature');
    assert.equal(sso.parentExternalId, 'FR-001');

    const req = merged.find((r) => r.name === 'Password login');
    assert.equal(req.level, 'Requirement');
    assert.equal(req.parentExternalId, 'FR-010');

    const slices = buildRequirementFrSlices({ functionalRequirements: merged });
    assert.ok(slices.length >= 1);
  });

  it('skips rejected proposals and invalid parents', () => {
    const frList = [
      {
        externalId: 'FR-001',
        level: 'Module',
        parentExternalId: '',
        name: 'Core',
      },
    ];

    const { frList: merged, addedCount } = mergeHierarchyProposalsIntoFrList(
      frList,
      {
        proposedFeatures: [
          {
            proposalId: 'PROP-F-1',
            parentExternalId: 'FR-001',
            level: 'Feature',
            name: 'Accepted feat',
            status: 'accepted',
          },
          {
            proposalId: 'PROP-F-2',
            parentExternalId: 'FR-001',
            level: 'Feature',
            name: 'Rejected feat',
            status: 'rejected',
          },
        ],
        proposedRequirements: [
          {
            proposalId: 'PROP-R-1',
            parentExternalId: 'FR-001',
            level: 'Requirement',
            name: 'Bad parent level',
            status: 'accepted',
          },
        ],
      }
    );

    assert.equal(addedCount, 1);
    assert.equal(merged.filter((r) => r.name === 'Rejected feat').length, 0);
    assert.equal(merged.filter((r) => r.name === 'Bad parent level').length, 0);
    assert.equal(merged.filter((r) => r.name === 'Accepted feat').length, 1);
  });
});
