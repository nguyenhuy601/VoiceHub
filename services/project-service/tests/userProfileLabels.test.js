const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  labelFromProfile,
  enrichMembershipUserLabels,
  enrichAssignableProfiles,
} = require('../src/utils/userProfileLabels');

const IDS = ['u1', 'u2', 'u3'];

describe('userProfileLabels', () => {
  it('labelFromProfile ưu tiên displayName, fallback 6 ký tự id', () => {
    assert.equal(labelFromProfile('abcdef123456', null).displayName, '123456');
    assert.equal(
      labelFromProfile('u1', { displayName: 'An', email: 'an@x.com' }).displayName,
      'An'
    );
    assert.equal(labelFromProfile('u1', { email: 'local@x.com' }).displayName, 'local');
  });

  it('enrichMembershipUserLabels: 1 batch, không N GET khi batch đủ', async () => {
    let batchCalls = 0;
    let getCalls = 0;
    const map = await enrichMembershipUserLabels(IDS, {
      fetchProfilesByUserIds: async (ids) => {
        batchCalls += 1;
        assert.deepEqual([...ids].sort(), [...IDS].sort());
        return new Map(ids.map((id) => [id, { userId: id, displayName: `User ${id}` }]));
      },
      fetchUserProfileByIdInternal: async () => {
        getCalls += 1;
        throw new Error('không được GET từng id');
      },
    });
    assert.equal(batchCalls, 1);
    assert.equal(getCalls, 0);
    assert.equal(map.get('u1').displayName, 'User u1');
    assert.equal(map.get('u3').displayName, 'User u3');
  });

  it('enrichMembershipUserLabels: batch thiếu → fallback GET đúng id còn thiếu', async () => {
    let getIds = [];
    const map = await enrichMembershipUserLabels(IDS, {
      fetchProfilesByUserIds: async () =>
        new Map([['u1', { userId: 'u1', displayName: 'One' }]]),
      fetchUserProfileByIdInternal: async (uid) => {
        getIds.push(uid);
        return { data: { data: { displayName: `Solo ${uid}` } } };
      },
    });
    assert.deepEqual(getIds.sort(), ['u2', 'u3']);
    assert.equal(map.get('u1').displayName, 'One');
    assert.equal(map.get('u2').displayName, 'Solo u2');
  });

  it('enrichAssignableProfiles: 1 batch, sort theo tên, avatar chuỗi rỗng', async () => {
    let batchCalls = 0;
    const rows = await enrichAssignableProfiles(['b', 'a'], 'actor', {
      fetchProfilesByUserIds: async (ids) => {
        batchCalls += 1;
        return new Map([
          ['a', { displayName: 'Bình', avatar: '/a.png' }],
          ['b', { displayName: 'An' }],
        ]);
      },
      fetchUserProfileByIdInternal: async () => {
        throw new Error('không được GET từng id');
      },
    });
    assert.equal(batchCalls, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].userId, 'b');
    assert.equal(rows[0].displayName, 'An');
    assert.equal(rows[0].avatar, '');
    assert.equal(rows[1].userId, 'a');
    assert.equal(rows[1].avatar, '/a.png');
  });
});
