const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('requirementSkillRegistry utils', () => {
  it('buildRequirementSkillRefs maps leaf skills', () => {
    const {
      buildRequirementSkillRefs,
      resolveSkillForInput,
    } = require('../src/utils/requirementSkillRegistry');
    const resolveMap = new Map([
      [
        'fastapi',
        {
          input: 'FastAPI',
          skillId: 'skill-1',
          name: 'FastAPI',
          status: 'PENDING',
          isNew: true,
        },
      ],
    ]);
    const refs = buildRequirementSkillRefs(
      {
        functionalRequirements: [
          {
            externalId: 'FR-10',
            level: 'Requirement',
            suggestedSkills: ['FastAPI'],
          },
        ],
      },
      resolveMap
    );
    assert.equal(refs.length, 1);
    assert.equal(refs[0].externalId, 'FR-10');
    assert.equal(refs[0].skillId, 'skill-1');
    assert.equal(resolveSkillForInput('FastAPI', resolveMap).status, 'PENDING');
  });
});
