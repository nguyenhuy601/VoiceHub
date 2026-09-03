const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLeafAssignments,
  scorePoolItemForLeaf,
} = require('../src/utils/aiPlanningLeafAssign');

function packFixture(overrides = {}) {
  return {
    functionalRequirements: [
      {
        externalId: 'FR-001',
        level: 'Task',
        name: 'Login UI',
        suggestedSkills: ['React'],
        estimateHours: 16,
        suggestedRoleKey: 'frontend_developer',
        sortOrder: 100,
      },
      {
        externalId: 'FR-002',
        level: 'Task',
        name: 'API auth',
        suggestedSkills: ['Node'],
        estimateHours: 24,
        suggestedRoleKey: 'backend_developer',
        sortOrder: 200,
      },
    ],
    requirementSkills: [
      {
        externalId: 'FR-001',
        skillNameSnapshot: 'React',
        requiredLevel: 3,
      },
    ],
    ...overrides,
  };
}

const poolItems = [
  {
    userId: 'u-fe',
    displayName: 'FE Dev',
    capability: { skills: [{ name: 'React', rank: 1, level: 4 }], businessDomains: [] },
    performance: null,
    capacityRange: { availableHours: 40, peakAllocatedPct: 10 },
  },
  {
    userId: 'u-be',
    displayName: 'BE Dev',
    capability: { skills: [{ name: 'Node', rank: 1, level: 4 }], businessDomains: [] },
    performance: null,
    capacityRange: { availableHours: 80, peakAllocatedPct: 10 },
  },
];

describe('aiPlanningLeafAssign', () => {
  it('builds leafAssignments with per-leaf suggestions and greedy assignee', () => {
    const rows = buildLeafAssignments({ pack: packFixture(), poolItems });
    assert.equal(rows.length, 2);
    const login = rows.find((r) => r.externalId === 'FR-001');
    const api = rows.find((r) => r.externalId === 'FR-002');
    assert.ok(login);
    assert.ok(api);
    assert.equal(login.suggestedUserId, 'u-fe');
    assert.equal(api.suggestedUserId, 'u-be');
    assert.ok(login.suggestions.length <= 3);
    assert.ok(login.suggestions[0].score >= 40);
  });

  it('scores leaf-specific skills above generic role match', () => {
    const leaf = packFixture().functionalRequirements[0];
    const feScore = scorePoolItemForLeaf({
      item: poolItems[0],
      leaf,
      pack: packFixture(),
      registrySkills: [],
    });
    const beScore = scorePoolItemForLeaf({
      item: poolItems[1],
      leaf,
      pack: packFixture(),
      registrySkills: [],
    });
    assert.ok(feScore.score > beScore.score);
  });

  it('returns empty suggestedUserId when pool is empty', () => {
    const rows = buildLeafAssignments({ pack: packFixture(), poolItems: [] });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].suggestedUserId, null);
    assert.equal(rows[0].suggestions.length, 0);
  });

  it('greedy load balancing avoids over-assigning same user when hours exceed capacity', () => {
    const pack = packFixture({
      functionalRequirements: [
        {
          externalId: 'FR-A',
          level: 'Task',
          name: 'A',
          suggestedSkills: ['React'],
          estimateHours: 30,
          suggestedRoleKey: 'frontend_developer',
          sortOrder: 1,
        },
        {
          externalId: 'FR-B',
          level: 'Task',
          name: 'B',
          suggestedSkills: ['React'],
          estimateHours: 30,
          suggestedRoleKey: 'frontend_developer',
          sortOrder: 2,
        },
      ],
    });
    const limitedPool = [
      {
        userId: 'u-only',
        displayName: 'Only',
        capability: { skills: [{ name: 'React', rank: 1, level: 4 }], businessDomains: [] },
        capacityRange: { availableHours: 40, peakAllocatedPct: 0 },
      },
    ];
    const rows = buildLeafAssignments({ pack, poolItems: limitedPool });
    const assigned = rows.filter((r) => r.suggestedUserId === 'u-only');
    assert.equal(assigned.length, 1);
    const unassigned = rows.find((r) => r.externalId === 'FR-B');
    assert.equal(unassigned?.suggestedUserId, null);
  });
});
