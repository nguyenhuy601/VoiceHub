const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_MEMBER_IDS,
  toPlainId,
  normalizeMemberIdList,
  assertActiveOrgMembers,
} = require('../src/utils/orgMemberIds');

const A = '64b7f0c2a1b2c3d4e5f60718';
const B = '64b7f0c2a1b2c3d4e5f60719';
const ORG = '64b7f0c2a1b2c3d4e5f60700';

function fakeMembership(activeIds) {
  return {
    async distinct(field, filter) {
      assert.equal(field, 'user');
      assert.equal(filter.status, 'active');
      assert.equal(filter.organization, ORG);
      return activeIds.filter((id) => filter.user.$in.includes(id));
    },
  };
}

describe('orgMemberIds', () => {
  it('toPlainId accepts ObjectId strings and empty → null', () => {
    assert.equal(toPlainId(` ${A} `), A);
    assert.equal(toPlainId(A.toUpperCase()), A);
    assert.equal(toPlainId(''), null);
    assert.equal(toPlainId(null), null);
    assert.equal(toPlainId({ toHexString: () => B }), B);
  });

  it('toPlainId rejects operator objects / arrays / bad strings', () => {
    for (const bad of [{ $ne: null }, [A], 123, 'not-an-id', `${A}x`]) {
      assert.throws(() => toPlainId(bad), (err) => err.statusCode === 400 && err.errorCode === 'ORG_INVALID_ID');
    }
  });

  it('normalizeMemberIdList dedupes and drops empties', () => {
    assert.deepEqual(normalizeMemberIdList([A, A.toUpperCase(), '', B]), [A, B]);
    assert.deepEqual(normalizeMemberIdList(undefined), []);
  });

  it('normalizeMemberIdList rejects non-array, injection, and > cap', () => {
    assert.throws(() => normalizeMemberIdList('x'), (err) => err.errorCode === 'ORG_VALIDATION_FAILED');
    assert.throws(() => normalizeMemberIdList([{ $ne: null }]), (err) => err.errorCode === 'ORG_INVALID_ID');
    const tooMany = Array.from({ length: MAX_MEMBER_IDS + 1 }, () => A);
    assert.throws(() => normalizeMemberIdList(tooMany), (err) => err.errorCode === 'ORG_BATCH_TOO_LARGE');
  });

  it('assertActiveOrgMembers passes when all active, rejects outsiders', async () => {
    await assertActiveOrgMembers(ORG, [A, B], { MembershipModel: fakeMembership([A, B]) });
    await assert.rejects(
      assertActiveOrgMembers(ORG, [A, B], { MembershipModel: fakeMembership([A]) }),
      (err) => err.statusCode === 400 && err.errorCode === 'ORG_MEMBER_NOT_IN_ORG'
    );
  });

  it('assertActiveOrgMembers skips query for empty list', async () => {
    const model = { distinct: () => { throw new Error('should not query'); } };
    await assertActiveOrgMembers(ORG, [], { MembershipModel: model });
  });
});
