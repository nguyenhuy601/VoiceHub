const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapTextToCapabilityFields,
  extractSkillsFromText,
  inferPositionCode,
  inferYearsExperience,
} = require('../src/services/cvParse.service');

describe('cvParse.service heuristic', () => {
  it('extracts whitelist skills from CV-like text', () => {
    const text = `
      Software Engineer — Backend
      Skills: React.js, Node.js, MongoDB, Docker, Kubernetes (K8s)
      3 years of experience building APIs
    `;
    const skills = extractSkillsFromText(text);
    const names = skills.map((s) => s.name);
    assert.ok(names.includes('React'));
    assert.ok(names.includes('Node.js'));
    assert.ok(names.includes('MongoDB'));
    assert.ok(names.includes('Docker'));
    assert.ok(names.includes('Kubernetes'));
  });

  it('infers position and years', () => {
    assert.equal(inferPositionCode('Senior QA Tester Selenium'), 'qa');
    assert.equal(inferPositionCode('Frontend Developer React'), 'dev');
    assert.equal(inferYearsExperience('5 years of experience in software'), 5);
  });

  it('mapTextToCapabilityFields returns draft-shaped fields', () => {
    const fields = mapTextToCapabilityFields(
      'Full-stack developer with React and NestJS. 2 năm kinh nghiệm.'
    );
    assert.equal(fields.positionCode, undefined);
    assert.ok(['fullstack', 'fe', 'be'].includes(fields.primaryDomain) || fields.primaryDomain);
    assert.equal(fields.yearsExperience, 2);
    assert.ok(fields.skills.some((s) => s.name === 'React'));
    assert.ok(fields.summary.length > 0);
  });
});
