const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { selectLeavesForPrompt } = require('../src/utils/aiPlanningPromptLeaves');
const { FR_LEAF_LEVEL } = require('../src/utils/requirementFrLevel');

function makeLeaf(id, roleKey, hours = 8, sortOrder = 0) {
  return {
    externalId: id,
    level: FR_LEAF_LEVEL,
    suggestedRoleKey: roleKey,
    estimateHours: hours,
    sortOrder,
    suggestedSkills: [],
  };
}

describe('selectLeavesForPrompt', () => {
  it('returns all leaves when under limit', () => {
    const frList = [makeLeaf('l1', 'frontend_developer'), makeLeaf('l2', 'backend_developer')];
    const result = selectLeavesForPrompt(frList, 40);
    assert.equal(result.leaves.length, 2);
    assert.equal(result.leavesOmittedCount, 0);
    assert.equal(result.totalLeaves, 2);
  });

  it('includes every unique role key before filling quota', () => {
    const frList = [];
    for (let i = 0; i < 50; i += 1) {
      const roleKey = i < 5 ? `role_${i}` : 'frontend_developer';
      frList.push(makeLeaf(`l${i}`, roleKey, 10 + i, i));
    }
    const result = selectLeavesForPrompt(frList, 40);
    const roleKeys = new Set(result.leaves.map((l) => l.suggestedRoleKey));
    assert.ok(roleKeys.has('role_0'));
    assert.ok(roleKeys.has('role_1'));
    assert.ok(roleKeys.has('role_2'));
    assert.ok(roleKeys.has('role_3'));
    assert.ok(roleKeys.has('role_4'));
    assert.equal(result.leaves.length, 40);
    assert.equal(result.leavesOmittedCount, 10);
    assert.equal(result.totalLeaves, 50);
  });

  it('prioritizes leaves missing staffing fields when filling same-role quota', () => {
    const frList = [
      makeLeaf('full', 'frontend_developer', 40, 1),
      {
        ...makeLeaf('missing', 'frontend_developer', 0, 2),
        estimateHours: null,
        suggestedSkills: [],
      },
    ];
    const result = selectLeavesForPrompt(frList, 2);
    assert.equal(result.leaves.length, 2);
    assert.ok(result.leaves.some((leaf) => leaf.externalId === 'missing'));
  });
});
