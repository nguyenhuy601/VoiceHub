const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('tokenVersionAuth', () => {
  let tokenVersionAuth;

  beforeEach(() => {
    delete require.cache[require.resolve('../utils/tokenVersionAuth')];
    tokenVersionAuth = require('../utils/tokenVersionAuth');
    tokenVersionAuth.setTokenVersionResolver(null);
  });

  afterEach(() => {
    tokenVersionAuth.setTokenVersionResolver(null);
    delete require.cache[require.resolve('../utils/tokenVersionAuth')];
  });

  it('fail-closed when no redis and no resolver', async () => {
    const ok = await tokenVersionAuth.isAccessTokenVersionValid('user-1', 1);
    assert.equal(ok, false);
  });

  it('rejects when token tv does not match resolver version', async () => {
    const userId = `user-mismatch-${Date.now()}`;
    tokenVersionAuth.setTokenVersionResolver(async () => 3);
    const ok = await tokenVersionAuth.isAccessTokenVersionValid(userId, 2);
    assert.equal(ok, false);
  });

  it('accepts when token tv matches resolver version', async () => {
    const userId = `user-match-${Date.now()}`;
    tokenVersionAuth.setTokenVersionResolver(async () => 5);
    const ok = await tokenVersionAuth.isAccessTokenVersionValid(userId, 5);
    assert.equal(ok, true);
  });

  it('resolver null returns fail-closed', async () => {
    const userId = `user-null-${Date.now()}`;
    tokenVersionAuth.setTokenVersionResolver(async () => null);
    const ok = await tokenVersionAuth.isAccessTokenVersionValid(userId, 0);
    assert.equal(ok, false);
  });
});
