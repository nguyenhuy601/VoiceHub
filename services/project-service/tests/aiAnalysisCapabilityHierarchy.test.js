'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runCapabilityAnalysis,
} = require('../src/utils/aiAnalysis/aiAnalysisCapability');
const { buildPackContentHash } = require('../src/utils/aiAnalysis/aiAnalysisCompactPolicy');
const {
  runHierarchyDecomposition,
} = require('../src/utils/aiAnalysis/aiAnalysisHierarchy');
const {
  mergeHierarchyProposalsIntoFrList,
} = require('../src/utils/aiAnalysis/aiAnalysisHierarchyMerge');

const packModulesFeaturesOnly = {
  overview: { name: 'Demo', platform: 'web' },
  functionalRequirements: [
    {
      externalId: 'M1',
      level: 'Module',
      name: 'Attendance',
    },
    {
      externalId: 'F1',
      level: 'Feature',
      name: 'GPS Check-in',
      parentExternalId: 'M1',
      moduleLabel: 'Attendance',
    },
  ],
};

const acceptedHierarchy = {
  proposedRequirements: [
    {
      proposalId: 'PROP-R-F1-1',
      parentExternalId: 'F1',
      name: 'Capture GPS on check-in',
      description: 'Record lat/lng when employee checks in',
      moduleLabel: 'Attendance',
      featureLabel: 'GPS Check-in',
      status: 'accepted',
    },
  ],
};

describe('runCapabilityAnalysis hierarchy union', () => {
  it('Module/Feature-only pack + accepted proposal → items ≥ 1 with proposal sourceFrIds', async () => {
    const empty = await runCapabilityAnalysis(packModulesFeaturesOnly, {
      forceHeuristic: true,
    });
    assert.equal(empty.items.length, 0);
    assert.equal(empty.meta.source, 'empty');

    const result = await runCapabilityAnalysis(packModulesFeaturesOnly, {
      hierarchy: acceptedHierarchy,
      forceHeuristic: true,
    });
    assert.ok(result.items.length >= 1);
    assert.equal(result.meta.source, 'heuristic');
    assert.ok(
      result.items.some((item) => (item.sourceFrIds || []).includes('PROP-R-F1-1')),
      'sourceFrIds must keep hierarchy proposalId'
    );
  });

  it('rejected proposals are excluded from capability input', async () => {
    const hierarchy = {
      proposedRequirements: [
        {
          proposalId: 'PROP-R-F1-rej',
          parentExternalId: 'F1',
          name: 'Rejected req',
          status: 'rejected',
        },
        {
          proposalId: 'PROP-R-F1-ok',
          parentExternalId: 'F1',
          name: 'Pending req',
          description: 'Should become a capability',
          status: 'pending',
        },
      ],
    };

    const result = await runCapabilityAnalysis(packModulesFeaturesOnly, {
      hierarchy,
      forceHeuristic: true,
    });
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0].sourceFrIds, ['PROP-R-F1-ok']);
  });

  it('content hash with hierarchy differs from pack-only hash', () => {
    const without = buildPackContentHash(packModulesFeaturesOnly);
    const withHier = buildPackContentHash(packModulesFeaturesOnly, {
      hierarchy: acceptedHierarchy,
    });
    assert.notEqual(without, withHier);
  });

  it('Module-only → hierarchy cascade → merge → capability items ≥ 1', async () => {
    const pack = {
      overview: { name: 'Auth', platform: 'web' },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Authentication',
          description: 'Login. Session. Password reset.',
        },
      ],
    };

    const prev = process.env.AI_PLANNING_LLM;
    process.env.AI_PLANNING_LLM = '0';
    try {
      const hierarchy = await runHierarchyDecomposition(pack, { forceHeuristic: true });
      assert.ok(hierarchy.proposedFeatures.length >= 1);
      assert.ok(hierarchy.proposedRequirements.length >= 1);

      const { frList: merged } = mergeHierarchyProposalsIntoFrList(
        pack.functionalRequirements,
        {
          proposedFeatures: hierarchy.proposedFeatures,
          proposedRequirements: hierarchy.proposedRequirements,
        }
      );
      assert.ok(merged.some((r) => r.level === 'Feature'));
      assert.ok(merged.some((r) => r.level === 'Requirement'));

      const capability = await runCapabilityAnalysis(
        { ...pack, functionalRequirements: merged },
        { forceHeuristic: true }
      );
      assert.ok(capability.items.length >= 1);
      assert.notEqual(capability.meta.source, 'empty');
    } finally {
      if (prev === undefined) delete process.env.AI_PLANNING_LLM;
      else process.env.AI_PLANNING_LLM = prev;
    }
  });
});
