/**
 * Semantic merge — FR ↔ skill/tech/role edges.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { projectAllSources } = require('../src/utils/aiAnalysis/pipeline/fieldProjection');
const { applyIngestionQuality } = require('../src/utils/aiAnalysis/pipeline/ingestionQuality');
const { canonicalizeProjected } = require('../src/utils/aiAnalysis/pipeline/canonicalize');
const { semanticMerge } = require('../src/utils/aiAnalysis/pipeline/semanticMerge');

describe('aiAnalysisSemanticMerge', () => {
  it('links FR-021 → PostgreSQL → SK-018 and mandatory tech', () => {
    const pack = {
      versionNumber: 1,
      overview: { requirementName: 'Orders', projectObjective: 'Ship' },
      functionalRequirements: [
        {
          externalId: 'FR-021',
          level: 'Requirement',
          name: 'Persist orders in PostgreSQL',
          description: 'Store order rows in PostgreSQL',
          suggestedSkills: ['PostgreSQL'],
          suggestedRoleKey: 'Backend Dev',
        },
      ],
      requirementSkills: [
        { externalId: 'FR-021', skillNameSnapshot: 'PostgreSQL', importance: 'required' },
      ],
      technology: [{ name: 'PostgreSQL', mandatory: true }],
      staffingPlan: {
        requiredSkills: [{ name: 'PostgreSQL' }],
        requiredRoles: [{ roleKey: 'Backend Dev', requiredCount: 1 }],
      },
    };

    let projected = projectAllSources({ pack, poolItems: [], calendar: {}, skillCatalog: {} });
    projected = applyIngestionQuality(projected).projected;
    const canonical = canonicalizeProjected(projected);
    const merged = semanticMerge(canonical);

    assert.ok(merged.requiredSkillIds.includes('SK-018'));
    assert.ok(merged.requiredRoleIds.includes('ROLE-BACKEND-DEV'));
    assert.ok(merged.edges.some((e) => e.from === 'FR-021' && e.to === 'SK-018'));
    assert.ok(merged.edges.some((e) => e.from === 'FR-021' && e.kind === 'fr_role'));
    const link = merged.frLinks.find((l) => l.frId === 'FR-021');
    assert.ok(link);
    assert.ok(link.skillCanonicalIds.includes('SK-018'));
    assert.ok(link.techCanonicalIds.length >= 1);
  });
});
