'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runCapabilityAnalysis,
} = require('../src/utils/aiAnalysis/aiAnalysisCapability');
const { buildPackContentHash } = require('../src/utils/aiAnalysis/aiAnalysisCompactPolicy');

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
});
