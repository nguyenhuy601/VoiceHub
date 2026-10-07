const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyProfileResponseShape,
  PEER_OMIT_FIELDS,
} = require('../src/utils/profileAccessMode');

describe('applyProfileResponseShape', () => {
  const full = {
    userId: 'u1',
    displayName: 'Ada',
    avatarUrl: '/a.png',
    status: 'online',
    email: 'ada@corp.com',
    phone: '090',
    dateOfBirth: '1990-01-01',
    bio: 'hello',
    location: 'HN',
    emailBlindIndex: 'x',
    capability: { publicVerified: true },
  };

  it('peer omits PII fields', () => {
    const peer = applyProfileResponseShape(full, 'peer');
    for (const key of PEER_OMIT_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(peer, key), false, `should omit ${key}`);
    }
    assert.equal(peer.displayName, 'Ada');
    assert.equal(peer.status, 'online');
    assert.deepEqual(peer.capability, { publicVerified: true });
  });

  it('self keeps email/phone/bio', () => {
    const self = applyProfileResponseShape(full, 'self');
    assert.equal(self.email, 'ada@corp.com');
    assert.equal(self.phone, '090');
    assert.equal(self.bio, 'hello');
  });

  it('admin keeps email/phone', () => {
    const admin = applyProfileResponseShape(full, 'admin');
    assert.equal(admin.email, 'ada@corp.com');
    assert.equal(admin.dateOfBirth, '1990-01-01');
  });
});
