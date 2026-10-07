const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  IDENTITY_KEYS,
  bodyWithoutIdentity,
} = require('../src/utils/common/trustedPayload');

describe('trustedPayload.bodyWithoutIdentity', () => {
  it('strips identity keys and keeps business fields', () => {
    const cleaned = bodyWithoutIdentity({
      userId: 'attacker',
      projectId: 'p1',
      boardId: 'b1',
      sprintId: 's1',
      organizationId: 'o1',
      createdBy: 'c1',
      updatedBy: 'u1',
      _id: 'id1',
      title: 'Sprint A',
      goal: 'Ship',
    });
    assert.deepEqual(cleaned, { title: 'Sprint A', goal: 'Ship' });
    for (const key of IDENTITY_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(cleaned, key), false);
    }
  });

  it('returns empty object for null, array, string', () => {
    assert.deepEqual(bodyWithoutIdentity(null), {});
    assert.deepEqual(bodyWithoutIdentity(['a']), {});
    assert.deepEqual(bodyWithoutIdentity('x'), {});
    assert.deepEqual(bodyWithoutIdentity(undefined), {});
  });

  it('drops operator keys that start with $ and keeps business fields', () => {
    const cleaned = bodyWithoutIdentity({
      title: 'Card',
      listId: '507f1f77bcf86cd799439011',
      labels: ['a'],
      estimate: 3,
      $ne: null,
      $gt: '',
    });
    assert.equal(cleaned.title, 'Card');
    assert.equal(cleaned.listId, '507f1f77bcf86cd799439011');
    assert.deepEqual(cleaned.labels, ['a']);
    assert.equal(cleaned.estimate, 3);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '$ne'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '$gt'), false);
  });

  it('does not copy prototype pollution keys', () => {
    const body = JSON.parse('{"title":"ok","__proto__":{"polluted":true}}');
    const cleaned = bodyWithoutIdentity(body);
    assert.equal(cleaned.title, 'ok');
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '__proto__'), false);
    assert.equal({}.polluted, undefined);
  });

  it('trusted values placed after spread win', () => {
    const body = bodyWithoutIdentity({ userId: 'attacker', title: 'T' });
    const payload = { ...body, userId: 'trusted', projectId: 'proj1' };
    assert.equal(payload.userId, 'trusted');
    assert.equal(payload.projectId, 'proj1');
    assert.equal(payload.title, 'T');
  });
});
