const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeStaffingProposal,
  applyEnrichmentToRoles,
  clampScoreDelta,
  SCORE_DELTA_MAX,
} = require('../src/utils/aiPlanningLlm');
const { extractJsonPayload } = require('../src/utils/ollamaClient');

describe('aiPlanningLlm normalizeStaffingProposal', () => {
  it('keeps whitelist skills and known roles; drops unknown', () => {
    const { proposal, dropped } = normalizeStaffingProposal({
      requiredSkills: ['React', 'UnknownSkillX', 'TypeScript'],
      requiredRoles: [
        { roleKey: 'frontend_developer', requiredCount: 2 },
        { roleKey: 'not_a_real_role', requiredCount: 1 },
      ],
      estimatedHoursTotal: 120.6,
      rationale: 'Need FE capacity',
    });
    assert.ok(proposal);
    assert.ok(proposal.requiredSkills.some((s) => s.name === 'React' && s.source === 'ai'));
    assert.ok(proposal.requiredSkills.some((s) => s.name === 'TypeScript'));
    assert.equal(proposal.requiredRoles.length, 1);
    assert.equal(proposal.requiredRoles[0].roleKey, 'frontend_developer');
    assert.equal(proposal.requiredRoles[0].requiredCount, 2);
    assert.equal(proposal.estimatedHoursTotal, 121);
    assert.ok(dropped.some((d) => d.startsWith('skill:')));
    assert.ok(dropped.some((d) => d.startsWith('role:')));
  });

  it('returns null for empty/invalid proposal', () => {
    assert.equal(normalizeStaffingProposal(null).proposal, null);
    assert.equal(normalizeStaffingProposal({ requiredSkills: [], requiredRoles: [] }).proposal, null);
  });
});

describe('aiPlanningLlm enrich clamp', () => {
  it('clamps scoreDelta to ±SCORE_DELTA_MAX', () => {
    assert.equal(clampScoreDelta(99), SCORE_DELTA_MAX);
    assert.equal(clampScoreDelta(-99), -SCORE_DELTA_MAX);
    assert.equal(clampScoreDelta(3), 3);
  });

  it('applies enrich deltas and re-sorts', () => {
    const roles = applyEnrichmentToRoles(
      [
        {
          roleKey: 'frontend_developer',
          suggestions: [
            { userId: 'u1', displayName: 'A', score: 70 },
            { userId: 'u2', displayName: 'B', score: 72 },
          ],
        },
      ],
      new Map([
        [
          'frontend_developer',
          new Map([
            ['u1', { rationale: 'Strong React', scoreDelta: 5 }],
            ['u2', { rationale: 'Weaker fit', scoreDelta: -3 }],
          ]),
        ],
      ])
    );
    assert.equal(roles[0].suggestions[0].userId, 'u1');
    assert.equal(roles[0].suggestions[0].score, 75);
    assert.equal(roles[0].suggestions[0].rationale, 'Strong React');
    assert.equal(roles[0].suggestions[1].score, 69);
  });
});

describe('ollamaClient extractJsonPayload', () => {
  it('parses object inside prose', () => {
    const data = extractJsonPayload('Here:\n{"a":1}\nThanks');
    assert.deepEqual(data, { a: 1 });
  });
});
