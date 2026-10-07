const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { requireTrustedUserId } = require('../src/utils/trustedUserId');

describe('requireTrustedUserId', () => {
  it('reads req.user.id', () => {
    assert.equal(requireTrustedUserId({ user: { id: 'abc' }, headers: {} }), 'abc');
  });

  it('ignores x-user-id header', () => {
    assert.equal(
      requireTrustedUserId({ user: undefined, headers: { 'x-user-id': 'evil' } }),
      ''
    );
  });

  it('prefers user over header even when both set', () => {
    assert.equal(
      requireTrustedUserId({ user: { id: 'good' }, headers: { 'x-user-id': 'evil' } }),
      'good'
    );
  });
});
