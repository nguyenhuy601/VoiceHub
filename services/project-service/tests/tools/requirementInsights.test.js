/**
 * Unit — requirementInsights.v1 schema
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_TOP_KEYS,
  INSIGHTS_SCHEMA_VERSION,
  normalizeRequirementInsights,
  buildHeuristicRequirementInsights,
  assertRequirementInsightsShape,
} = require('../../src/utils/tools/requirementInsightsSchema');

describe('requirementInsights schema', () => {
  it('normalize fills all required top keys', () => {
    const out = normalizeRequirementInsights({
      understanding: { name: 'P', narrative: 'n' },
      evidence: [{ claim: 'c', source: { tool: 'gate_a_requirement_quality' } }],
      clarifications: [{ text: 'Need geofence', frId: 'FR-1' }],
    });
    for (const key of REQUIRED_TOP_KEYS) {
      assert.ok(out[key] !== undefined, `missing ${key}`);
    }
    assert.equal(out.schemaVersion, INSIGHTS_SCHEMA_VERSION);
    assert.equal(out.evidence.length, 1);
    assert.equal(out.clarifications[0].frId, 'FR-1');
    assertRequirementInsightsShape(out);
  });

  it('drops evidence without source.tool|frId|packField', () => {
    const out = normalizeRequirementInsights({
      evidence: [{ claim: 'orphan', source: {} }, { claim: 'ok', source: { frId: 'FR-2' } }],
    });
    assert.equal(out.evidence.length, 1);
    assert.equal(out.evidence[0].source.frId, 'FR-2');
  });

  it('heuristic builds insights from Facts without inventing coverage', () => {
    const insights = buildHeuristicRequirementInsights({
      pack: {
        overview: { requirementName: 'Attend', projectObjective: 'GPS check-in' },
        aiAnalysis: {
          analyses: {
            requirementTools: {
              facts: {
                'coverage.weighted': 0.82,
                'completeness.score': 0.7,
                'consistency.conflictCount': 0,
                'scope.ambiguousCount': 2,
              },
              gateA: { passed: false, checks: [] },
            },
          },
        },
      },
    });
    assert.equal(insights.quality.coverageWeighted, 0.82);
    assert.equal(insights.quality.gateAPassed, false);
    assert.equal(insights.ambiguityGaps.ambiguousCount, 2);
    assert.ok(insights.clarifications.length >= 1);
    assert.ok(insights.evidence.some((e) => e.source.tool));
    assertRequirementInsightsShape(insights);
  });

  it('heuristic reasoning fallback without inventing metrics', async () => {
    const { runRequirementReasoning } = require('../../src/utils/tools/runRequirementReasoning');
    const { insights, meta } = await runRequirementReasoning({
      pack: {
        overview: { requirementName: 'X' },
        aiAnalysis: {
          analyses: {
            requirementTools: {
              facts: { 'coverage.weighted': 0.91 },
              gateA: { passed: true, checks: [] },
            },
          },
        },
      },
      forceHeuristic: true,
    });
    assert.equal(insights.quality.coverageWeighted, 0.91);
    assert.equal(meta.mode, 'heuristic');
  });
});
