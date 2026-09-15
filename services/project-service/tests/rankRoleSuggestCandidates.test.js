const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  INTAKE_LEAD_ROLE_KEYS,
  PRIOR_ROLE_BOOST,
  isExactIntakeRoleKeys,
  isAllowedIntakeRoleKeys,
  rankRoleSuggestCandidate,
  toRoleSuggestPublicItem,
  sortRoleSuggestItems,
} = require('../src/utils/staffing/rankRoleSuggestCandidates');

describe('isExactIntakeRoleKeys', () => {
  it('chấp nhận đúng 3 key intake không kể thứ tự', () => {
    assert.equal(
      isExactIntakeRoleKeys('business_analyst,product_owner,project_manager'),
      true
    );
    assert.equal(isExactIntakeRoleKeys([...INTAKE_LEAD_ROLE_KEYS].reverse()), true);
  });

  it('từ chối thiếu / thừa key', () => {
    assert.equal(isExactIntakeRoleKeys('product_owner,project_manager'), false);
    assert.equal(
      isExactIntakeRoleKeys('product_owner,project_manager,business_analyst,developer'),
      false
    );
  });
});

describe('isAllowedIntakeRoleKeys', () => {
  it('T2 product_owner only → allowed; developer → false', () => {
    assert.equal(isAllowedIntakeRoleKeys('product_owner'), true);
    assert.equal(isAllowedIntakeRoleKeys('developer'), false);
  });
});

describe('rankRoleSuggestCandidate', () => {
  const poPreferred = {
    userId: 'u1',
    displayName: 'Lan',
    jobTitle: 'Product Manager',
  };

  it('T1 position preferred > no match', () => {
    const preferred = rankRoleSuggestCandidate(poPreferred, { projectRoleKey: 'product_owner' });
    const none = rankRoleSuggestCandidate(
      { userId: 'u2', displayName: 'Nam', jobTitle: '' },
      { projectRoleKey: 'product_owner' }
    );
    assert.ok(preferred.score > none.score);
    assert.ok(preferred.suggestReasons.includes('position_preferred'));
    assert.ok(!none.suggestReasons.includes('position_preferred'));
  });

  it('T1 unverified capability không boost / không cv_verified', () => {
    const base = rankRoleSuggestCandidate(poPreferred, { projectRoleKey: 'product_owner' });
    const draft = rankRoleSuggestCandidate(
      {
        ...poPreferred,
        verifiedCapability: {
          verificationStatus: 'draft',
          yearsExperience: 12,
          skills: [{ name: 'react', rank: 1, level: 5 }],
        },
      },
      { projectRoleKey: 'product_owner' }
    );
    assert.equal(draft.score, base.score);
    assert.ok(!draft.suggestReasons.includes('cv_verified'));
    assert.equal(draft.yearsExperience, undefined);
  });

  it('T1 prior_role tăng score', () => {
    const without = rankRoleSuggestCandidate(poPreferred, { projectRoleKey: 'product_owner' });
    const withPrior = rankRoleSuggestCandidate(
      { ...poPreferred, hasPriorRole: true },
      { projectRoleKey: 'product_owner' }
    );
    assert.equal(withPrior.score, without.score + PRIOR_ROLE_BOOST);
    assert.ok(withPrior.suggestReasons.includes('prior_role'));
    assert.deepEqual(withPrior.priorRoleKeys, ['product_owner']);
  });

  it('whitelist không chứa experience.work', () => {
    const ranked = rankRoleSuggestCandidate(
      {
        userId: 'u3',
        displayName: 'Hà',
        jobTitle: 'Business Analyst',
        verifiedCapability: {
          verificationStatus: 'verified',
          yearsExperience: 4,
          projectExperiences: [
            { status: 'verified', role: 'business_analyst', work: 'secret-cv-body' },
          ],
        },
      },
      { projectRoleKey: 'business_analyst' }
    );
    const pub = toRoleSuggestPublicItem({
      ...ranked,
      experience: { work: 'should-omit' },
      capability: { skills: [] },
    });
    const json = JSON.stringify(pub);
    assert.equal(Object.prototype.hasOwnProperty.call(pub, 'experience'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(pub, 'capability'), false);
    assert.equal(json.includes('secret-cv-body'), false);
    assert.equal(json.includes('should-omit'), false);
    assert.equal(pub.yearsExperience, 4);
    assert.ok(pub.suggestReasons.includes('cv_verified'));
  });

  it('whitelist giữ allocatedPct + availability, không leak CV', () => {
    const pub = toRoleSuggestPublicItem({
      userId: 'u4',
      displayName: 'Minh',
      jobTitle: 'PM',
      score: 10,
      suggestReasons: [],
      priorRoleKeys: [],
      allocatedPct: 120,
      availability: 'overallocated',
      experience: { work: 'nope' },
    });
    assert.equal(pub.allocatedPct, 120);
    assert.equal(pub.availability, 'overallocated');
    assert.equal(Object.prototype.hasOwnProperty.call(pub, 'experience'), false);
  });

  it('sort score desc', () => {
    const sorted = sortRoleSuggestItems([
      { displayName: 'B', score: 1 },
      { displayName: 'A', score: 10 },
    ]);
    assert.equal(sorted[0].score, 10);
    assert.ok(sorted[0].score >= sorted[1].score);
  });
});
