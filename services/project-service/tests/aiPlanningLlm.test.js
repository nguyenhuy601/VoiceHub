const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeStaffingProposal,
  applyEnrichmentToRoles,
  clampScoreDelta,
  buildPackPromptSlice,
  buildStaffingRolesPromptSlice,
  buildStaffingSkillsPromptSlice,
  SCORE_DELTA_MAX,
  MAX_FR_LEAVES_IN_PROMPT,
} = require('../src/utils/aiPlanningLlm');
const { extractJsonPayload } = require('../src/utils/ollamaClient');
const { isRegistryEnabled } = require('../src/clients/skillRegistry.client');

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
    if (!isRegistryEnabled()) {
      assert.ok(dropped.some((d) => d.startsWith('skill:')));
    }
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

  it('applies enrich deltas and re-sorts when evidence exists', () => {
    const poolByUserId = new Map([
      [
        'u1',
        { jobTitle: 'Software Developer', capability: { seniorityBand: 'senior' } },
      ],
      ['u2', { jobTitle: 'Accountant', capability: {} }],
    ]);
    const roles = applyEnrichmentToRoles(
      [
        {
          roleKey: 'frontend_developer',
          suggestions: [
            { userId: 'u1', displayName: 'A', score: 70, matchedSkills: ['React'] },
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
      ]),
      { poolByUserId }
    );
    assert.equal(roles[0].suggestions[0].userId, 'u1');
    assert.equal(roles[0].suggestions[0].score, 75);
    assert.equal(roles[0].suggestions[0].rationale, 'Strong React');
    assert.equal(roles[0].suggestions[0].jobTitle, 'Software Developer');
    assert.equal(roles[0].suggestions[0].seniorityBand, 'senior');
    assert.equal(roles[0].suggestions[1].score, 72);
    assert.equal(roles[0].suggestions[1].scoreDelta, undefined);
  });

  it('forces scoreDelta to 0 without enrich evidence', () => {
    const roles = applyEnrichmentToRoles(
      [
        {
          roleKey: 'frontend_developer',
          suggestions: [{ userId: 'u1', displayName: 'A', score: 70 }],
        },
      ],
      new Map([
        ['frontend_developer', new Map([['u1', { rationale: 'Sounds good', scoreDelta: 5 }]])],
      ]),
      { poolByUserId: new Map([['u1', { jobTitle: 'Unknown', capability: {} }]]) }
    );
    assert.equal(roles[0].suggestions[0].score, 70);
    assert.equal(roles[0].suggestions[0].scoreDelta, undefined);
    assert.equal(roles[0].suggestions[0].rationale, 'Sounds good');
  });

  it('buildEnrichCompactFromRoles includes jobTitle in enrich input', () => {
    const { buildEnrichCompactFromRoles: buildCompact } = require('../src/utils/aiPlanningEnrichContext');
    const compact = buildCompact(
      [
        {
          roleKey: 'frontend_developer',
          suggestions: [{ userId: 'u1', displayName: 'A', score: 70 }],
        },
      ],
      [{ userId: 'u1', jobTitle: 'Frontend Developer', capability: { seniorityBand: 'mid' } }]
    );
    assert.equal(compact[0].suggestions[0].jobTitle, 'Frontend Developer');
    assert.equal(compact[0].suggestions[0].seniorityBand, 'mid');
  });

  it('enrichRankingRationales fail-open keeps heuristic roles when LLM disabled', async () => {
    const { enrichRankingRationales } = require('../src/utils/aiPlanningLlm');
    const original = process.env.AI_PLANNING_LLM;
    process.env.AI_PLANNING_LLM = '0';
    const roles = [
      {
        roleKey: 'frontend_developer',
        suggestions: [{ userId: 'u1', displayName: 'A', score: 70 }],
      },
    ];
    const result = await enrichRankingRationales(roles, { poolItems: [] });
    assert.equal(result.status, 'skipped');
    assert.deepEqual(result.roles, roles);
    if (original === undefined) delete process.env.AI_PLANNING_LLM;
    else process.env.AI_PLANNING_LLM = original;
  });
});

describe('ollamaClient extractJsonPayload', () => {
  it('parses object inside prose', () => {
    const data = extractJsonPayload('Here:\n{"a":1}\nThanks');
    assert.deepEqual(data, { a: 1 });
  });
});

describe('aiPlanningLlm buildPackPromptSlice', () => {
  it('includes NFR, technology, scope, orgPoolSummary, and requirementSkills', () => {
    const slice = buildPackPromptSlice(
      {
        overview: {
          requirementName: 'Portal',
          budget: 100000,
          startDate: new Date('2026-01-01'),
          deadline: new Date('2026-06-01'),
        },
        nonFunctionalRequirements: [{ category: 'Performance', requirement: 'P99 < 200ms' }],
        technology: [{ name: 'React', mandatory: true }, { name: 'Node.js', mandatory: false }],
        scope: [{ type: 'in', description: 'Web app' }, { type: 'out', description: 'Mobile' }],
        requirementSkills: [
          { skillId: 'abc', skillNameSnapshot: 'React', requiredLevel: 4, importance: 'required' },
        ],
        functionalRequirements: [],
      },
      {
        baseline: { fteRoles: [], totalLeafHours: 100, rollup: { estimatedHoursTotal: 100 } },
        poolSummary: { headcount: 5, topSkills: [{ name: 'React', count: 3 }] },
        registrySkills: [{ _id: 'abc', normalizedName: 'React', status: 'ACTIVE' }],
      }
    );

    assert.equal(slice.nonFunctionalRequirements.length, 1);
    assert.equal(slice.technology[0].name, 'React');
    assert.ok(slice.technology[0].mandatory);
    assert.deepEqual(slice.scope.in, ['Web app']);
    assert.deepEqual(slice.scope.out, ['Mobile']);
    assert.equal(slice.requirementSkills[0].skillId, 'abc');
    assert.equal(slice.orgPoolSummary.headcount, 5);
    assert.equal(slice.registrySkillHints[0].name, 'React');
    assert.ok(slice.constraints.budget);
    assert.ok(slice.baselineStaffing.totalLeafHours);
  });

  it('compact staffing slice is smaller and omits echo-prone fields', () => {
    const frList = [];
    for (let i = 0; i < 14; i += 1) {
      frList.push({
        externalId: `l${i}`,
        level: 'Requirement',
        name: `Leaf ${i}`,
        description: 'Long description that should be omitted in compact mode',
        suggestedRoleKey: 'frontend_developer',
        estimateHours: 8,
        acceptanceCriteria: 'AC line that should be omitted',
        priority: 'High',
      });
    }
    const pack = {
      overview: {
        requirementName: 'Portal',
        projectObjective: 'Objective',
        businessScope: 'Scope',
      },
      functionalRequirements: frList,
      requirementSkills: [{ skillNameSnapshot: 'React' }],
    };
    const full = buildPackPromptSlice(pack, {
      baseline: { fteRoles: [], totalLeafHours: 100, rollup: { estimatedHoursTotal: 100 } },
      registrySkills: [{ _id: 'abc', normalizedName: 'React', status: 'ACTIVE' }],
    });
    const compact = buildPackPromptSlice(pack, {
      baseline: { fteRoles: [], totalLeafHours: 100, rollup: { estimatedHoursTotal: 100 } },
      registrySkills: [{ _id: 'abc', normalizedName: 'React', status: 'ACTIVE' }],
      compactForStaffing: true,
    });
    assert.ok(compact.sliceMeta.byteLength < full.sliceMeta.byteLength);
    assert.equal(compact.sliceMeta.compactForStaffing, true);
    assert.ok(!compact.leaves[0].description);
    assert.ok(!compact.registrySkillHints);
    assert.deepEqual(compact.requirementSkills, ['React']);
  });

  it('split staffing slices are smaller than compact single-call slice', () => {
    const frList = [];
    for (let i = 0; i < 14; i += 1) {
      frList.push({
        externalId: `l${i}`,
        level: 'Requirement',
        name: `Leaf ${i}`,
        description: 'Long description',
        suggestedRoleKey: 'frontend_developer',
        suggestedSkills: ['React'],
        estimateHours: 8,
        acceptanceCriteria: 'AC line',
        priority: 'High',
      });
    }
    const pack = {
      overview: { requirementName: 'Portal', projectObjective: 'Build portal' },
      functionalRequirements: frList,
      requirementSkills: [{ skillNameSnapshot: 'React' }],
      technology: [{ name: 'React', mandatory: true }],
    };
    const baseline = {
      fteRoles: [{ roleKey: 'frontend_developer', requiredCount: 2, leafCount: 14, roleHours: 112 }],
      totalLeafHours: 112,
      rollup: { estimatedHoursTotal: 112 },
    };
    const compact = buildPackPromptSlice(pack, { baseline, compactForStaffing: true });
    const rolesSlice = buildStaffingRolesPromptSlice(pack, { baseline });
    const skillsSlice = buildStaffingSkillsPromptSlice(pack, {});
    assert.ok(rolesSlice.sliceMeta.byteLength < compact.sliceMeta.byteLength);
    assert.ok(skillsSlice.sliceMeta.byteLength < compact.sliceMeta.byteLength);
    assert.equal(rolesSlice.sliceMeta.phase, 'roles');
    assert.equal(skillsSlice.sliceMeta.phase, 'skills');
    assert.ok(!rolesSlice.leaves);
    assert.ok(skillsSlice.leafSuggestedSkills.length > 0);
  });

  it('mergeStaffingPhaseResults merges roles and skills; skills fallback when skills phase empty', () => {
    const { mergeStaffingPhaseResults } = require('../src/utils/aiPlanningLlm');
    const pack = {
      requirementSkills: [{ skillNameSnapshot: 'TypeScript' }],
      technology: [{ name: 'React', mandatory: true }],
    };
    const rolesPhase = {
      partial: {
        requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 2, source: 'ai' }],
        estimatedHoursTotal: 120,
        rationale: 'Roles ok',
      },
      dropped: [],
    };
    const { proposal, dropped } = mergeStaffingPhaseResults(rolesPhase, { partial: null }, pack, null);
    assert.ok(proposal);
    assert.equal(proposal.requiredRoles.length, 1);
    assert.ok(proposal.requiredSkills.length >= 1);
    assert.ok(dropped.includes('skills_heuristic_fallback'));
  });

  it('uses smart leaf selection when over MAX_FR_LEAVES_IN_PROMPT', () => {
    const frList = [];
    for (let i = 0; i < 60; i += 1) {
      frList.push({
        externalId: `l${i}`,
        level: 'Requirement',
        name: `Leaf ${i}`,
        suggestedRoleKey: i < 3 ? `role_${i}` : 'frontend_developer',
        estimateHours: 8,
        sortOrder: i,
        acceptanceCriteria: `AC ${i}`,
        priority: 'High',
      });
    }
    const slice = buildPackPromptSlice({ functionalRequirements: frList, overview: {} });
    assert.equal(slice.leaves.length, MAX_FR_LEAVES_IN_PROMPT);
    assert.equal(slice.sliceMeta.leavesOmittedCount, 20);
    assert.equal(slice.sliceMeta.totalLeaves, 60);
    assert.ok(slice.leaves[0].acceptanceCriteria);
  });
});
