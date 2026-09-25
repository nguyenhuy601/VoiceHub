/**
 * Unit — buildRequirementAiContext
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRequirementAiContext,
  formatVerifiedFactsBlock,
  enrichProjectContextWithRequirementAi,
} = require('../../src/utils/tools/buildRequirementAiContext');

describe('requirementAiContext', () => {
  it('returns all required Phase 1 context keys', () => {
    const ctx = buildRequirementAiContext({
      pack: {
        overview: {
          requirementName: 'Attendance',
          projectObjective: 'Check-in',
          priority: 'High',
        },
        constraints: [{ description: 'No offline' }],
        functionalRequirements: [
          { externalId: 'FR-1', level: 'Requirement', priority: 'Critical', name: 'A' },
          { externalId: 'FR-2', level: 'Requirement', priority: 'High', name: 'B' },
        ],
      },
      requirementTools: {
        facts: {
          'coverage.weighted': 0.625,
          'consistency.conflictCount': 1,
          'scope.ambiguousCount': 2,
          'completeness.score': 0.7,
        },
        gateA: { passed: false, checks: [{ id: 'coverage', passed: false }] },
        recipe: {
          consistency: { conflicts: [{ left: 'FR-1', right: 'NFR-1' }] },
          scope: { signals: { ambiguity: [{ frId: 'FR-2' }] } },
        },
      },
    });

    assert.ok(ctx.problem);
    assert.equal(ctx.problem.name, 'Attendance');
    assert.ok(ctx.consistency);
    assert.equal(ctx.consistency.conflictCount, 1);
    assert.ok(Array.isArray(ctx.constraints));
    assert.ok(ctx.ambiguity);
    assert.ok(ctx.priorities);
    assert.equal(ctx.priorities.Critical, 1);
    assert.ok(ctx.feasibilitySummary);
    assert.equal(ctx.feasibilitySummary.status, 'unknown');
    assert.ok(ctx.factsSummary['coverage.weighted'] === 0.625);
    assert.equal(ctx.gateA.passed, false);
  });

  it('formatVerifiedFactsBlock includes VERIFIED_FACTS banner', () => {
    const block = formatVerifiedFactsBlock(
      buildRequirementAiContext({
        pack: { overview: {}, functionalRequirements: [] },
        requirementTools: { facts: { 'gateA.passed': true }, gateA: { passed: true, checks: [] } },
      })
    );
    assert.match(block, /VERIFIED_FACTS/);
    assert.match(block, /do NOT invent numbers/i);
  });

  it('enrichProjectContextWithRequirementAi merges verifiedFacts', () => {
    const enriched = enrichProjectContextWithRequirementAi(
      { name: 'X' },
      {
        overview: { requirementName: 'X' },
        aiAnalysis: {
          analyses: {
            requirementTools: {
              facts: { 'coverage.weighted': 1 },
              gateA: { passed: true, checks: [] },
            },
          },
        },
      }
    );
    assert.equal(enriched.name, 'X');
    assert.ok(enriched.requirementAiContext);
    assert.equal(enriched.verifiedFacts['coverage.weighted'], 1);
  });
});
