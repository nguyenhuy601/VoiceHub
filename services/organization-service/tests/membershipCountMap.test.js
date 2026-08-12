const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { membershipCountMap } = require('../src/utils/membershipCountMap');

describe('membershipCountMap', () => {
  it('rỗng / null → object rỗng', () => {
    assert.deepEqual(membershipCountMap(null), {});
    assert.deepEqual(membershipCountMap([]), {});
  });

  it('gộp count theo orgId', () => {
    const oid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const map = membershipCountMap([
      { _id: oid, n: 12 },
      { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', n: 1 },
    ]);
    assert.equal(map[oid], 12);
    assert.equal(map.bbbbbbbbbbbbbbbbbbbbbbbb, 1);
  });
});
