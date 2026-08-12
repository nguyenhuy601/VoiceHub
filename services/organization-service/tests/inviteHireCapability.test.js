const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseOptionalHireCapability } = require('../src/utils/inviteHireCapability');

describe('parseOptionalHireCapability', () => {
  it('returns null when invite has no KN fields', () => {
    const out = parseOptionalHireCapability({
      email: 'a@voicehub.net',
      jobTitle: 'Backend Developer',
      departmentId: 'x',
    });
    assert.equal(out.ok, true);
    assert.equal(out.value, null);
  });

  it('accepts full hire KN same catalog as Excel', () => {
    const out = parseOptionalHireCapability({
      includeHireCapability: true,
      primaryDomain: 'Backend',
      skills: ['Node.js', { name: 'MongoDB' }],
      yearsExperience: 5,
      maxConcurrentProjects: 2,
      pastProjects: [
        {
          name: 'Cổng thanh toán nội bộ',
          role: 'Backend Developer',
          work: 'API đối soát Node.js/MongoDB',
          year: 2024,
        },
      ],
    });
    assert.equal(out.ok, true);
    assert.equal(out.value.primaryDomain, 'be');
    assert.deepEqual(out.value.skills, ['Node.js', 'MongoDB']);
    assert.equal(out.value.yearsExperience, 5);
    assert.equal(out.value.pastProjects.length, 1);
    assert.equal(out.value.pastProjects[0].name, 'Cổng thanh toán nội bộ');
  });

  it('rejects unknown skill and incomplete DA', () => {
    const badSkill = parseOptionalHireCapability({
      primaryDomain: 'be',
      skills: 'HackingEvil',
      yearsExperience: 1,
    });
    assert.equal(badSkill.ok, false);
    assert.equal(badSkill.errorCode, 'VALIDATION_SKILL_NOT_IN_CATALOG');

    const badDa = parseOptionalHireCapability({
      primaryDomain: 'be',
      skills: 'Jira',
      yearsExperience: 1,
      pastProjects: [{ name: 'X', role: '', work: '' }],
    });
    assert.equal(badDa.ok, false);
    assert.equal(badDa.errorCode, 'VALIDATION_PAST_PROJECT_INCOMPLETE');
  });

  it('infers include from any KN field without flag', () => {
    const out = parseOptionalHireCapability({
      primaryDomain: 'ba',
      skills: 'Jira',
      yearsExperience: 3,
    });
    assert.equal(out.ok, true);
    assert.equal(out.value.primaryDomain, 'ba');
    assert.equal(out.value.maxConcurrentProjects, 2);
  });

  it('rejects hire skills above HIRE_SKILLS_MAX', () => {
    const { HIRE_SKILLS_MAX, SKILL_WHITELIST } = require('../src/utils/resourceImportValidator');
    const eleven = SKILL_WHITELIST.slice(0, HIRE_SKILLS_MAX + 1);
    const out = parseOptionalHireCapability({
      primaryDomain: 'be',
      skills: eleven,
      yearsExperience: 1,
    });
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'VALIDATION_SKILLS_HIRE_MAX');
  });
});
