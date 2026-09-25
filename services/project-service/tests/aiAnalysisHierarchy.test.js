/**
 * Hierarchy decomposition heuristics — APS engine (remote-cutover).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHeuristicFeatureProposals,
  buildHeuristicRequirementProposals,
  buildModuleSlices,
  buildFeatureSlices,
  runHierarchyEngine,
} = require('../../ai-project-planning-service/src/engines/hierarchy');

describe('aiAnalysisHierarchy (APS engine)', () => {
  it('Module-only pack proposes Features and cascaded Requirements', () => {
    const pack = {
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

    const moduleSlices = buildModuleSlices(pack);
    assert.equal(moduleSlices.length, 1);
    assert.deepEqual(moduleSlices[0].childFeatureIds, []);

    const features = buildHeuristicFeatureProposals(moduleSlices);
    assert.ok(features.length >= 1 && features.length <= 3);
    assert.ok(features.every((p) => p.level === 'Feature'));
    assert.ok(features.every((p) => p.parentExternalId === 'FR-001'));
    assert.ok(features.every((p) => String(p.proposalId).startsWith('PROP-F-FR-001-')));
    assert.ok(features.every((p) => p.source === 'heuristic'));

    const result = runHierarchyEngine(pack);
    assert.ok(result.proposedFeatures.length >= 1);
    assert.ok(result.proposedRequirements.length >= 1);
    const featureIds = new Set(result.proposedFeatures.map((p) => p.proposalId));
    assert.ok(
      result.proposedRequirements.every((r) => featureIds.has(r.parentExternalId)),
      'cascaded Requirements must parent to proposed Feature proposalIds'
    );
  });

  it('Module+Feature pack proposes Requirements for childless Features', () => {
    const pack = {
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Billing',
          description: 'Payments module',
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Invoicing',
          description: 'Create invoice. Send invoice. Void invoice.',
          mainFlow: 'User opens invoice form',
        },
      ],
    };

    const featureSlices = buildFeatureSlices(pack);
    assert.equal(featureSlices.length, 1);
    assert.deepEqual(featureSlices[0].childRequirementIds, []);

    const requirements = buildHeuristicRequirementProposals(featureSlices);
    assert.ok(requirements.length >= 1 && requirements.length <= 3);
    assert.ok(requirements.every((p) => p.level === 'Requirement'));
    assert.ok(requirements.every((p) => p.parentExternalId === 'FR-002'));
    assert.ok(requirements.every((p) => String(p.proposalId).startsWith('PROP-R-FR-002-')));

    const featureProposals = buildHeuristicFeatureProposals(buildModuleSlices(pack));
    assert.equal(featureProposals.length, 0);
  });

  it('does not duplicate children when Requirements already exist', () => {
    const pack = {
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Core',
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Profile',
        },
        {
          externalId: 'FR-003',
          level: 'Requirement',
          parentExternalId: 'FR-002',
          name: 'Edit profile',
        },
      ],
    };

    const moduleSlices = buildModuleSlices(pack);
    const featureSlices = buildFeatureSlices(pack);
    assert.ok(moduleSlices[0].childFeatureIds.includes('FR-002'));
    assert.ok(featureSlices[0].childRequirementIds.includes('FR-003'));

    assert.deepEqual(buildHeuristicFeatureProposals(moduleSlices), []);
    assert.deepEqual(buildHeuristicRequirementProposals(featureSlices), []);

    const result = runHierarchyEngine(pack);
    assert.equal(result.proposedFeatures.length, 0);
    assert.equal(result.proposedRequirements.length, 0);
  });
});
