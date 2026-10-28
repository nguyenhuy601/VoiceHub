const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreFallbackCandidateAgainstTags,
  collectCapabilityTechTokens,
} = require('../src/utils/staffing/capabilityMatch');

describe('staffingFallback suggest rank (Wave A)', () => {
  it('ranks higher when tags match skills/tech', () => {
    const strong = scoreFallbackCandidateAgainstTags({
      verifiedCapability: {
        verificationStatus: 'verified',
        seniorityBand: 'mid',
        skills: [
          { name: 'React', level: 4, rank: 1 },
          { name: 'Node.js', level: 3, rank: 2 },
        ],
        projectExperiences: [
          {
            technologies: ['React'],
            taskHighlights: [{ title: 'UI board', tags: ['React'] }],
          },
        ],
      },
      taskTags: ['React', 'GraphQL'],
    });
    const weak = scoreFallbackCandidateAgainstTags({
      capability: {
        verificationStatus: 'draft',
        skills: [{ name: 'Java', level: 3, rank: 1 }],
      },
      taskTags: ['React', 'GraphQL'],
    });
    assert.ok(strong.score > weak.score);
    assert.ok(strong.matched.some((m) => /react/i.test(String(m))));
  });

  it('returns zero score when no tags', () => {
    const r = scoreFallbackCandidateAgainstTags({
      capability: { skills: [{ name: 'React' }] },
      taskTags: [],
    });
    assert.equal(r.score, 0);
  });

  it('collectCapabilityTechTokens includes highlights tags', () => {
    const tokens = collectCapabilityTechTokens({
      skills: [{ name: 'Go' }],
      projectExperiences: [{ taskHighlights: [{ tags: ['Kafka'] }] }],
    });
    assert.ok(tokens.includes('Go'));
    assert.ok(tokens.includes('Kafka'));
  });
});
