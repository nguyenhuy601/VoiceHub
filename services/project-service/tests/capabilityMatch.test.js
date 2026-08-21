const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scoreVerifiedCapability, scoreCapabilitySkills } = require('../src/utils/capabilityMatch');

describe('capabilityMatch', () => {
  const verified = {
    verificationStatus: 'verified',
    seniorityBand: 'senior',
    skills: [
      { name: 'Java', level: 4, rank: 1 },
      { name: 'Spring', level: 5, rank: 2 },
      { name: 'AWS', level: 3, rank: 3 },
    ],
    businessDomains: [
      { name: 'Payment', rank: 1 },
      { name: 'Banking', rank: 2 },
    ],
  };

  it('scores verified backend skills', () => {
    const r = scoreCapabilitySkills(verified, ['java', 'spring']);
    assert.equal(r.matched.length, 2);
    assert.ok(r.boost > 0);
  });

  it('adds boost for verified capability on backend role', () => {
    const r = scoreVerifiedCapability({
      verifiedCapability: verified,
      projectRoleKey: 'backend_developer',
      requiredDomains: ['payment'],
    });
    assert.ok(r.boost > 0);
    assert.ok(r.skillMatch.matched.includes('Java'));
    assert.ok(r.domainMatch.matched.includes('Payment'));
    assert.ok(r.reasons.some((x) => x.startsWith('seniority_')));
  });

  it('returns zero when capability not verified', () => {
    const r = scoreVerifiedCapability({
      verifiedCapability: { verificationStatus: 'draft', skills: [] },
      projectRoleKey: 'backend_developer',
    });
    assert.equal(r.boost, 0);
  });
});
