'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runCapabilityEngine,
} = require('../../ai-project-planning-service/src/engines/capability');
const { buildPackContentHash } = require('../src/utils/aiAnalysis/aiAnalysisCompactPolicy');
const {
  runHierarchyEngine,
} = require('../../ai-project-planning-service/src/engines/hierarchy');
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
      level: 'Requirement',
      name: 'Capture GPS on check-in',
      description: 'Record lat/lng when employee checks in',
      moduleLabel: 'Attendance',
      featureLabel: 'GPS Check-in',
      status: 'accepted',
    },
  ],
};

describe('runCapabilityEngine hierarchy union (APS)', () => {
  it('Module/Feature-only pack + accepted proposal → items ≥ 1 with proposal sourceFrIds', () => {
    const { frList: merged, addedIds } = mergeHierarchyProposalsIntoFrList(
      packModulesFeaturesOnly.functionalRequirements,
      acceptedHierarchy
    );
    assert.ok(addedIds.length >= 1);
    const result = runCapabilityEngine({
      ...packModulesFeaturesOnly,
      functionalRequirements: merged,
    });
    assert.ok(result.items.length >= 1);
    assert.equal(result.meta.source, 'heuristic');
    assert.ok(
      result.items.some((item) =>
        (item.sourceFrIds || []).some((id) => addedIds.includes(id))
      ),
      'sourceFrIds must include merged hierarchy FR ids'
    );
    assert.ok(
      result.items.some((item) => /Capture GPS/i.test(item.name || '')),
      'capability name comes from accepted proposal'
    );
  });

  it('rejected proposals are excluded from capability input', () => {
    const hierarchy = {
      proposedRequirements: [
        {
          proposalId: 'PROP-R-F1-rej',
          parentExternalId: 'F1',
          level: 'Requirement',
          name: 'Rejected req',
          status: 'rejected',
        },
        {
          proposalId: 'PROP-R-F1-ok',
          parentExternalId: 'F1',
          level: 'Requirement',
          name: 'Pending req',
          description: 'Should become a capability',
          status: 'pending',
        },
      ],
    };

    const { frList: merged, addedIds } = mergeHierarchyProposalsIntoFrList(
      packModulesFeaturesOnly.functionalRequirements,
      hierarchy
    );
    assert.equal(addedIds.length, 1);
    const result = runCapabilityEngine({
      ...packModulesFeaturesOnly,
      functionalRequirements: merged,
    });
    assert.ok(result.items.some((item) => /Pending req/i.test(item.name || '')));
    assert.equal(
      result.items.some((item) => /Rejected req/i.test(item.name || '')),
      false
    );
  });

  it('content hash with hierarchy differs from pack-only hash', () => {
    const without = buildPackContentHash(packModulesFeaturesOnly);
    const withHier = buildPackContentHash(packModulesFeaturesOnly, {
      hierarchy: acceptedHierarchy,
    });
    assert.notEqual(without, withHier);
  });

  it('Module-only → hierarchy cascade → merge → capability items ≥ 1', () => {
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

    const hierarchy = runHierarchyEngine(pack);
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

    const capability = runCapabilityEngine({
      ...pack,
      functionalRequirements: merged,
    });
    assert.ok(capability.items.length >= 1);
    assert.notEqual(capability.meta.source, 'empty');
  });
});
