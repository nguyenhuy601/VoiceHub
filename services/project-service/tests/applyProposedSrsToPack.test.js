/**
 * applyProposedSrsToPack — Analysis-equivalent sheet mapping from AI WHAT.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  applyProposedSrsToPack,
  applyDeltasToFrList,
} = require('../src/utils/aiAnalysis/applyProposedSrsToPack');

describe('applyProposedSrsToPack', () => {
  it('maps hierarchy + deltas + overview into Analysis-like sheets', () => {
    const pack = {
      overview: {
        requirementName: 'CRM',
        projectObjective: 'Grow sales',
        businessScope: 'In: sales pipeline',
        priority: 'High',
      },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Sales',
        },
      ],
      businessGoals: [],
      scope: [],
      businessRules: [],
      businessProcesses: [],
      useCases: [],
      nonFunctionalRequirements: [],
    };

    const container = {
      analyses: {
        hierarchy: {
          proposedFeatures: [
            {
              proposalId: 'P1',
              parentExternalId: 'FR-001',
              level: 'Feature',
              name: 'Leads',
              status: 'accepted',
            },
          ],
          proposedRequirements: [
            {
              proposalId: 'P2',
              parentExternalId: 'P1',
              level: 'Requirement',
              name: 'Capture lead',
              description: 'User can capture a lead',
              status: 'pending',
            },
          ],
        },
        proposedSrs: {
          deltas: [
            {
              kind: 'fr_patch',
              externalId: 'FR-001',
              field: 'description',
              proposedText: 'Module for sales ops',
              applied: false,
            },
          ],
        },
        requirementInsights: {
          understanding: 'CRM helps sales team',
          businessImpact: 'Increase conversion',
          clarifications: [],
        },
        capability: {
          items: [{ name: 'Lead mgmt', description: 'Manage leads end to end' }],
        },
        gap: {
          items: [{ severity: 'high', message: 'Need SSO latency under 2s', category: 'Performance' }],
        },
      },
    };

    const { pack: out, meta } = applyProposedSrsToPack(pack, container);

    assert.ok(meta.addedFrCount >= 1);
    assert.ok(meta.sheetsTouched.includes('functionalRequirements'));
    assert.ok(out.businessGoals.length >= 1);
    assert.equal(out.businessGoals[0].externalId, 'BG-001');
    assert.ok(out.scope.length >= 1);
    assert.ok(out.businessRules.length >= 1);
    assert.ok(out.businessRules[0].externalId.startsWith('BR-'));
    assert.ok(out.nonFunctionalRequirements.length >= 1);
    assert.ok(out.useCases.length >= 1 || out.functionalRequirements.some((r) => r.level === 'Requirement'));
    assert.ok(out.businessProcesses.length >= 1);

    const module = out.functionalRequirements.find((r) => r.externalId === 'FR-001');
    assert.ok(String(module.description || '').includes('Module for sales ops'));
  });

  it('applyDeltasToFrList appends proposed text', () => {
    const { frList, packNotes } = applyDeltasToFrList(
      [{ externalId: 'FR-010', description: 'Base' }],
      [{ kind: 'fr_patch', externalId: 'FR-010', field: 'description', proposedText: 'Extra' }]
    );
    assert.match(frList[0].description, /Base/);
    assert.match(frList[0].description, /Extra/);
    assert.equal(packNotes.length, 0);
  });

  it('keeps existing sheets when already populated', () => {
    const pack = {
      overview: { projectObjective: 'X' },
      functionalRequirements: [],
      businessGoals: [{ externalId: 'BG-009', title: 'Existing', statement: 'Keep' }],
      scope: [{ type: 'in', description: 'Existing scope' }],
      businessRules: [{ externalId: 'BR-009', title: 'Rule', description: 'R' }],
      businessProcesses: [],
      useCases: [],
      nonFunctionalRequirements: [],
    };
    const { pack: out } = applyProposedSrsToPack(pack, {
      analyses: {
        hierarchy: { proposedFeatures: [], proposedRequirements: [] },
        proposedSrs: { deltas: [] },
        requirementInsights: { understanding: 'Should not replace BG' },
        capability: { items: [{ name: 'Cap' }] },
      },
    });
    assert.equal(out.businessGoals[0].externalId, 'BG-009');
    assert.equal(out.scope[0].description, 'Existing scope');
    assert.equal(out.businessRules[0].externalId, 'BR-009');
  });
});
