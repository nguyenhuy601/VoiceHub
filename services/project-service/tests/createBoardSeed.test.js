const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDelegationTemplateId,
  normalizeSeedMembers,
  inferBoardRoleFromProjectKeys,
} = require('../src/utils/createBoardSeed');

describe('createBoardSeed', () => {
  it('T1: invalid template → product', () => {
    assert.equal(normalizeDelegationTemplateId(''), 'product');
    assert.equal(normalizeDelegationTemplateId('nope'), 'product');
    assert.equal(normalizeDelegationTemplateId('startup'), 'startup');
    assert.equal(normalizeDelegationTemplateId('Outsourcing'), 'outsourcing');
  });

  it('T1: member thiếu userId / keys bị bỏ qua; creator bị skip', () => {
    const rows = normalizeSeedMembers(
      [
        { projectRoleKeys: ['developer'] },
        { userId: 'u1', projectRoleKeys: [] },
        { userId: 'creator', projectRoleKeys: ['qa'] },
        { userId: 'u2', projectRoleKeys: ['developer', 'qa'] },
        { userId: 'u2', projectRoleKeys: ['developer'] },
      ],
      { creatorUserId: 'creator' }
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, 'u2');
    assert.deepEqual(rows[0].projectRoleKeys, ['developer', 'qa']);
    assert.equal(rows[0].boardRole, 'editor');
  });

  it('watcher-only → viewer boardRole', () => {
    assert.equal(inferBoardRoleFromProjectKeys(['watcher']), 'viewer');
    assert.equal(inferBoardRoleFromProjectKeys(['developer']), 'editor');
    const rows = normalizeSeedMembers([{ userId: 'w1', projectRoleKeys: ['watcher'] }]);
    assert.equal(rows[0].boardRole, 'viewer');
  });
});
