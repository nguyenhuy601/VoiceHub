/**
 * Canonicalize fixtures — alias → ROLE/TECH/SK.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { canonicalizeRole } = require('../src/utils/aiAnalysis/pipeline/canonicalRoleMap');
const { canonicalizeTech } = require('../src/utils/aiAnalysis/pipeline/canonicalTechMap');
const { canonicalizeSkill } = require('../src/utils/aiAnalysis/pipeline/canonicalSkillMap');
const { SKILL_WHITELIST_FIXTURE } = (() => {
  // Local mirror of capability whitelist names for coverage check
  const names = [
    'JavaScript',
    'TypeScript',
    'React',
    'Vue',
    'Node.js',
    'Express',
    'NestJS',
    'Java',
    'Spring',
    'Python',
    'Django',
    'Go',
    'C#',
    '.NET',
    'PHP',
    'Laravel',
    'MongoDB',
    'PostgreSQL',
    'MySQL',
    'Redis',
    'Docker',
    'Kubernetes',
    'CI/CD',
    'Git',
    'REST API',
    'GraphQL',
    'WebSocket',
    'Selenium',
    'Playwright',
    'Jest',
    'Cypress',
    'Manual Testing',
    'API Testing',
    'Figma',
    'Agile/Scrum',
    'Jira',
    'Requirement Analysis',
    'System Design',
    'AWS',
    'Linux',
    'React Native',
  ];
  return { SKILL_WHITELIST_FIXTURE: names };
})();

describe('aiAnalysisCanonicalize', () => {
  it('maps Backend Dev / BE Developer / React Native / PostgreSQL', () => {
    assert.equal(canonicalizeRole('Backend Dev').canonicalId, 'ROLE-BACKEND-DEV');
    assert.equal(canonicalizeRole('BE Developer').canonicalId, 'ROLE-BACKEND-DEV');
    assert.equal(canonicalizeRole('Back-end Developer').canonicalId, 'ROLE-BACKEND-DEV');
    assert.equal(canonicalizeTech('React Native').canonicalId, 'TECH-034');
    assert.equal(canonicalizeSkill('PostgreSQL').canonicalId, 'SK-018');
    assert.equal(canonicalizeSkill('postgres').canonicalId, 'SK-018');
    assert.equal(canonicalizeSkill('React Native').canonicalId, 'SK-041');
  });

  it('maps ≥90% of capability whitelist skill names', () => {
    let mapped = 0;
    for (const name of SKILL_WHITELIST_FIXTURE) {
      const r = canonicalizeSkill(name);
      if (r.canonicalId && r.canonicalId !== 'SK-UNMAPPED') mapped += 1;
    }
    const ratio = mapped / SKILL_WHITELIST_FIXTURE.length;
    assert.ok(ratio >= 0.9, `expected ≥0.9 mapped, got ${ratio} (${mapped}/${SKILL_WHITELIST_FIXTURE.length})`);
  });
});
