const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPoolByUserId,
  compactProjectExperiences,
  buildEnrichCandidatePayload,
  hasEnrichEvidence,
  projectExperienceOverlap,
  buildEnrichCompactFromRoles,
  shrinkEnrichCompact,
} = require('../src/utils/aiPlanningEnrichContext');

describe('aiPlanningEnrichContext', () => {
  it('buildPoolByUserId normalizes ObjectId-like and string userIds', () => {
    const map = buildPoolByUserId([
      { userId: '507f1f77bcf86cd799439011', jobTitle: 'Dev' },
      { userId: { toString: () => '507f1f77bcf86cd799439011' }, jobTitle: 'Dup' },
    ]);
    assert.equal(map.size, 1);
    assert.equal(map.get('507f1f77bcf86cd799439011').jobTitle, 'Dup');
  });

  it('compactProjectExperiences keeps verified-only and strips name', () => {
    const rows = compactProjectExperiences([
      { status: 'verified', role: 'frontend_developer', work: 'Web', year: 2024, name: 'Secret Client' },
      { status: 'pending', role: 'backend_developer', work: 'API', year: 2023 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'frontend_developer');
    assert.equal(rows[0].work, 'Web');
    assert.ok(!('name' in rows[0]));
    assert.ok(!JSON.stringify(rows).includes('Secret'));
  });

  it('buildEnrichCandidatePayload includes jobTitle and compact experiences', () => {
    const payload = buildEnrichCandidatePayload(
      { userId: 'u1', displayName: 'A', score: 80, matchedSkills: ['React'] },
      {
        jobTitle: 'Software Developer',
        capability: {
          seniorityBand: 'senior',
          yearsExperience: 8,
          projectExperiences: [{ status: 'verified', role: 'frontend_developer', work: 'Portal', year: 2022 }],
        },
      },
      'frontend_developer'
    );
    assert.equal(payload.jobTitle, 'Software Developer');
    assert.equal(payload.seniorityBand, 'senior');
    assert.equal(payload.projectExperiences.length, 1);
    assert.ok(payload.positionMatchKey);
  });

  it('hasEnrichEvidence uses matchedSkills, position match, and experience overlap', () => {
    const poolItem = {
      jobTitle: 'Software Developer',
      capability: {
        projectExperiences: [{ role: 'frontend_developer', work: 'App' }],
      },
    };
    assert.equal(
      hasEnrichEvidence({ matchedSkills: ['React'] }, poolItem, 'frontend_developer'),
      true
    );
    assert.equal(hasEnrichEvidence({}, poolItem, 'frontend_developer'), true);
    assert.equal(
      hasEnrichEvidence({}, { jobTitle: 'Unknown Title', capability: {} }, 'frontend_developer'),
      false
    );
    assert.equal(projectExperienceOverlap(poolItem, 'frontend_developer'), true);
  });

  it('buildEnrichCompactFromRoles omits email from payload', () => {
    const compact = buildEnrichCompactFromRoles(
      [
        {
          roleKey: 'frontend_developer',
          requiredCount: 1,
          suggestions: [{ userId: 'u1', displayName: 'A', score: 70 }],
        },
      ],
      [{ userId: 'u1', jobTitle: 'Dev', email: 'secret@example.com', capability: { skills: [] } }]
    );
    assert.equal(compact[0].suggestions[0].jobTitle, 'Dev');
    assert.ok(!JSON.stringify(compact).includes('secret@example.com'));
  });

  it('shrinkEnrichCompact drops projectExperiences when over byte cap', () => {
    const big = [
      {
        roleKey: 'frontend_developer',
        suggestions: Array.from({ length: 5 }, (_, i) => ({
          userId: `u${i}`,
          displayName: `User ${i}`,
          jobTitle: 'Software Developer',
          projectExperiences: Array.from({ length: 3 }, () => ({
            role: 'frontend_developer',
            work: 'x'.repeat(500),
            year: 2020,
          })),
        })),
      },
    ];
    const shrunk = shrinkEnrichCompact(big, 512);
    assert.ok(Buffer.byteLength(JSON.stringify(shrunk), 'utf8') <= 512 || shrunk[0].suggestions.length <= 3);
    const hasExp = JSON.stringify(shrunk).includes('projectExperiences');
    assert.equal(hasExp, false);
  });
});
