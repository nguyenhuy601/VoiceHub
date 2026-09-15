const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isAllowedIntakeRoleKeys,
  sliceRoleSuggestPage,
  filterRoleSuggestFitAvailable,
} = require('../src/utils/staffing/rankRoleSuggestCandidates');

describe('isAllowedIntakeRoleKeys', () => {
  it('T2 chấp nhận 1 key intake', () => {
    assert.equal(isAllowedIntakeRoleKeys('product_owner'), true);
  });

  it('T2 từ chối key ngoài intake', () => {
    assert.equal(isAllowedIntakeRoleKeys('developer'), false);
    assert.equal(isAllowedIntakeRoleKeys('product_owner,developer'), false);
  });
});

describe('sliceRoleSuggestPage', () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ userId: `u${i}`, score: 8 - i }));

  it('T1 offset 0 limit 3 → 3, hasMore true', () => {
    const page = sliceRoleSuggestPage(eight, { offset: 0, limit: 3 });
    assert.equal(page.items.length, 3);
    assert.equal(page.items[0].userId, 'u0');
    assert.equal(page.hasMore, true);
    assert.equal(page.total, 8);
  });

  it('T1 offset 3 limit 3 → 3, hasMore true', () => {
    const page = sliceRoleSuggestPage(eight, { offset: 3, limit: 3 });
    assert.equal(page.items.length, 3);
    assert.equal(page.items[0].userId, 'u3');
    assert.equal(page.hasMore, true);
  });

  it('T1 offset 6 limit 3 → 2, hasMore false', () => {
    const page = sliceRoleSuggestPage(eight, { offset: 6, limit: 3 });
    assert.equal(page.items.length, 2);
    assert.equal(page.items[0].userId, 'u6');
    assert.equal(page.hasMore, false);
  });
});

describe('filterRoleSuggestFitAvailable', () => {
  it('T1 preferred + 40% keep; 100% drop; prior 99% keep; no reason drop; overallocated drop', () => {
    const kept = filterRoleSuggestFitAvailable([
      { userId: 'a', suggestReasons: ['position_preferred'], allocatedPct: 40 },
      { userId: 'b', suggestReasons: ['position_preferred'], allocatedPct: 100 },
      { userId: 'c', suggestReasons: ['prior_role'], allocatedPct: 99 },
      { userId: 'd', suggestReasons: ['cv_verified'], allocatedPct: 0 },
      { userId: 'e', suggestReasons: [], allocatedPct: 0 },
      {
        userId: 'f',
        suggestReasons: ['position_preferred'],
        allocatedPct: 80,
        availability: 'overallocated',
      },
    ]);
    assert.deepEqual(
      kept.map((r) => r.userId),
      ['a', 'c']
    );
  });

  it('T2 slice sau filter: 5 fit → offset 0 limit 3 hasMore true', () => {
    const fit = filterRoleSuggestFitAvailable(
      Array.from({ length: 5 }, (_, i) => ({
        userId: `f${i}`,
        suggestReasons: ['position_preferred'],
        allocatedPct: 10 * i,
      }))
    );
    const page = sliceRoleSuggestPage(fit, { offset: 0, limit: 3 });
    assert.equal(fit.length, 5);
    assert.equal(page.items.length, 3);
    assert.equal(page.hasMore, true);
    assert.equal(page.total, 5);
  });
});
