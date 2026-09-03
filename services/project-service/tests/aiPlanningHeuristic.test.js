const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildHeuristicOverlay,
  scorePoolItemForRole,
} = require('../src/utils/aiPlanningHeuristic');

function packFixture(overrides = {}) {
  return {
    overview: {
      requirementName: 'Demo',
      deadline: new Date('2026-12-30'),
      startDate: new Date('2026-01-01'),
    },
    staffingPlan: {
      requiredSkills: [{ name: 'React', source: 'rollup' }],
      requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 1, source: 'rollup' }],
      estimatedHoursTotal: 40,
    },
    functionalRequirements: [
      {
        externalId: 'FR-001',
        level: 'Requirement',
        suggestedSkills: ['React'],
        estimateHours: 40,
        suggestedRoleKey: 'frontend_developer',
      },
    ],
    ...overrides,
  };
}

describe('aiPlanningHeuristic', () => {
  it('ranks skill-matched user above non-match', () => {
    const pack = packFixture();
    const overlay = buildHeuristicOverlay({
      pack,
      poolItems: [
        {
          userId: 'u-weak',
          displayName: 'Weak',
          capability: {
            skills: [{ name: 'Java', rank: 1, level: 3 }],
            businessDomains: [],
          },
          performance: null,
          availablePct: 80,
        },
        {
          userId: 'u-strong',
          displayName: 'Strong',
          capability: {
            skills: [{ name: 'React', rank: 1, level: 4 }],
            businessDomains: [],
            seniorityBand: 'senior',
          },
          performance: {
            confidence: 'high',
            estimationAccuracyPct: 90,
            reworkRate: 0,
            actualHoursPerWeek: 30,
          },
          availablePct: 80,
          capacityRange: { availableHours: 100, peakAllocatedPct: 20 },
        },
      ],
      window: { from: '2026-01-01', to: '2026-12-30', source: 'pack' },
    });

    assert.equal(overlay.engine, 'heuristic_v1');
    assert.equal(overlay.roles.length, 1);
    assert.equal(overlay.roles[0].suggestions[0].userId, 'u-strong');
    assert.ok(overlay.roles[0].suggestions[0].score > overlay.roles[0].suggestions[1].score);
  });

  it('emits role_candidate_shortfall when fewer candidates than requiredCount', () => {
    const pack = packFixture({
      staffingPlan: {
        requiredSkills: [{ name: 'React', source: 'rollup' }],
        requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 2, source: 'rollup' }],
        estimatedHoursTotal: 80,
      },
    });
    const overlay = buildHeuristicOverlay({
      pack,
      poolItems: [
        {
          userId: 'u1',
          displayName: 'Only One',
          capability: {
            skills: [{ name: 'React', rank: 1, level: 3 }],
            businessDomains: [],
          },
          availablePct: 50,
        },
      ],
    });
    assert.ok(
      overlay.gaps.some(
        (g) => g.type === 'role_candidate_shortfall' && g.roleKey === 'frontend_developer'
      )
    );
    assert.equal(overlay.roles[0].suggestions.length, 1);
  });

  it('scorePoolItemForRole returns zero-ish when no capability', () => {
    const scored = scorePoolItemForRole({
      item: { userId: 'u0', displayName: 'Empty', availablePct: 0 },
      roleKey: 'frontend_developer',
      requiredSkills: ['React'],
    });
    assert.equal(scored.userId, 'u0');
    assert.ok(scored.score <= 45);
  });

  it('uses staffingRoles FTE counts instead of pack staffingPlan leaf counts', () => {
    const pack = packFixture({
      staffingPlan: {
        requiredSkills: [{ name: 'React', source: 'rollup' }],
        requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 20, source: 'rollup' }],
        estimatedHoursTotal: 160,
      },
    });
    const overlay = buildHeuristicOverlay({
      pack,
      staffingRoles: [{ roleKey: 'frontend_developer', requiredCount: 2, leafCount: 20, roleHours: 160 }],
      poolItems: [
        {
          userId: 'u1',
          displayName: 'One',
          capability: { skills: [{ name: 'React', rank: 1, level: 3 }], businessDomains: [] },
          availablePct: 50,
        },
      ],
    });
    assert.equal(overlay.roles[0].requiredCount, 2);
    assert.equal(overlay.inputMeta.staffingSource, 'baseline_fte');
    assert.ok(
      overlay.gaps.some(
        (g) => g.type === 'role_candidate_shortfall' && g.requiredCount === 2
      )
    );
  });

  it('staffingRoles takes priority over staffingOverride', () => {
    const pack = packFixture();
    const overlay = buildHeuristicOverlay({
      pack,
      staffingRoles: [{ roleKey: 'frontend_developer', requiredCount: 1, leafCount: 1 }],
      staffingOverride: {
        requiredRoles: [{ roleKey: 'backend_developer', requiredCount: 5 }],
        requiredSkills: [{ name: 'Java' }],
      },
      poolItems: [],
    });
    assert.equal(overlay.roles.length, 1);
    assert.equal(overlay.roles[0].roleKey, 'frontend_developer');
    assert.equal(overlay.inputMeta.staffingSource, 'baseline_fte');
  });
});
