const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mergeProposalSkillsForStaffingPlan } = require('../src/utils/aiPlanningProposalSkills');

describe('aiPlanningProposalSkills', () => {
  it('preserves skillId from requirementSkills by exact name', () => {
    const result = mergeProposalSkillsForStaffingPlan({
      proposalSkills: ['React', 'Docker'],
      packRequirementSkills: [
        {
          skillId: '507f1f77bcf86cd799439011',
          skillNameSnapshot: 'React',
          requiredLevel: 4,
          registryStatus: 'ACTIVE',
        },
      ],
      baselineRollupSkills: [],
      registrySkills: [
        {
          _id: '507f1f77bcf86cd799439012',
          normalizedName: 'Docker',
          status: 'ACTIVE',
        },
      ],
    });

    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'React');
    assert.equal(result[0].skillId, '507f1f77bcf86cd799439011');
    assert.equal(result[0].requiredLevel, 4);
    assert.equal(result[1].name, 'Docker');
    assert.equal(result[1].skillId, '507f1f77bcf86cd799439012');
  });

  it('does not substring-match Java vs JavaScript', () => {
    const result = mergeProposalSkillsForStaffingPlan({
      proposalSkills: ['JavaScript'],
      packRequirementSkills: [
        {
          skillId: '507f1f77bcf86cd799439099',
          skillNameSnapshot: 'Java',
          requiredLevel: 3,
        },
      ],
      registrySkills: [],
    });
    assert.equal(result[0].name, 'JavaScript');
    assert.equal(result[0].skillId, null);
  });

  it('picks highest requiredLevel when duplicate names in requirementSkills', () => {
    const result = mergeProposalSkillsForStaffingPlan({
      proposalSkills: ['React'],
      packRequirementSkills: [
        { skillNameSnapshot: 'React', requiredLevel: 2 },
        { skillId: 'abc', skillNameSnapshot: 'React', requiredLevel: 5 },
      ],
    });
    assert.equal(result[0].requiredLevel, 5);
    assert.equal(result[0].skillId, 'abc');
  });

  it('falls back to name-only when no match', () => {
    const result = mergeProposalSkillsForStaffingPlan({
      proposalSkills: ['UnknownSkill'],
    });
    assert.deepEqual(result[0], {
      name: 'UnknownSkill',
      skillId: null,
      requiredLevel: null,
      registryStatus: '',
      source: 'ai',
    });
  });
});
