const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rankMembersByResponsibility } = require('../src/utils/responsibilitySuggest');
const {
  ROLE_KIND,
  DEFAULT_RESPONSIBILITY_KEYS,
  assertNotResponsibilityForPermission,
} = require('@enterprise/shared/config/roleTaxonomy');

describe('responsibilitySuggest rank', () => {
  it('puts matching responsibility users first', () => {
    const members = [
      { userId: 'a', displayName: 'Alice' },
      { userId: 'b', displayName: 'Bob' },
      { userId: 'c', displayName: 'Carol' },
    ];
    const ranked = rankMembersByResponsibility(members, ['c', 'a']);
    assert.equal(ranked[0].suggested, true);
    assert.equal(ranked[1].suggested, true);
    assert.equal(ranked[2].suggested, false);
    assert.equal(ranked[2].userId, 'b');
    assert.equal(ranked[0].suggestReason, 'responsibility');
  });

  it('no key match → none suggested', () => {
    const ranked = rankMembersByResponsibility(
      [{ userId: 'a', displayName: 'A' }],
      []
    );
    assert.equal(ranked[0].suggested, false);
  });
});

describe('taxonomy responsibility', () => {
  it('exports responsibility kind and default keys', () => {
    assert.equal(ROLE_KIND.RESPONSIBILITY, 'responsibility');
    assert.ok(DEFAULT_RESPONSIBILITY_KEYS.includes('backend'));
  });

  it('forbids using responsibility as permission grant', () => {
    assert.throws(
      () => assertNotResponsibilityForPermission(ROLE_KIND.RESPONSIBILITY),
      (err) => err.errorCode === 'RESPONSIBILITY_NOT_FOR_PERMISSION'
    );
  });
});
