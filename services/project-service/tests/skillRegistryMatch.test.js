const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scoreRegistrySkillMatch } = require('../src/utils/skillRegistryMatch');

describe('skillRegistryMatch', () => {
  const registrySkills = [
    {
      skillId: 'pg-id',
      name: 'PostgreSQL',
      normalizedName: 'postgresql',
      parentSkillId: 'sql-id',
      relatedSkillIds: ['sql-id'],
      aliases: ['postgres'],
    },
    {
      skillId: 'sql-id',
      name: 'SQL',
      normalizedName: 'sql',
      relatedSkillIds: [],
    },
  ];

  it('scores exact skill match with level adequacy', () => {
    const result = scoreRegistrySkillMatch(
      [{ skillId: 'pg-id', name: 'PostgreSQL', requiredLevel: 3 }],
      {
        verificationStatus: 'verified',
        skills: [{ skillId: 'pg-id', name: 'PostgreSQL', level: 4, rank: 1 }],
      },
      registrySkills
    );
    assert.ok(result.matched.includes('PostgreSQL'));
    assert.ok(result.boost > 0);
    assert.equal(result.levelGaps.length, 0);
  });

  it('scores related skill when exact missing', () => {
    const result = scoreRegistrySkillMatch(
      [{ skillId: 'pg-id', name: 'PostgreSQL', requiredLevel: 3 }],
      {
        verificationStatus: 'verified',
        skills: [{ skillId: 'sql-id', name: 'SQL', level: 4, rank: 1 }],
      },
      registrySkills
    );
    assert.equal(result.matched.length, 0);
    assert.ok(result.relatedMatched.length >= 1);
    assert.ok(result.boost > 0);
  });

  it('flags level gap when employee under required level', () => {
    const result = scoreRegistrySkillMatch(
      [{ skillId: 'pg-id', name: 'PostgreSQL', requiredLevel: 4 }],
      {
        verificationStatus: 'verified',
        skills: [{ skillId: 'pg-id', name: 'PostgreSQL', level: 2, rank: 1 }],
      },
      registrySkills
    );
    assert.equal(result.levelGaps.length, 1);
  });
});
