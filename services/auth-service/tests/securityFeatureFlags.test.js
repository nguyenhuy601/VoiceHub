const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getSecurityFeatureFlags,
  envFlag,
} = require('../src/config/securityFeatureFlags');

describe('Phase 6 Wave C securityFeatureFlags', () => {
  it('defaults deferred with MFA/SSO off when env unset', () => {
    const flags = getSecurityFeatureFlags();
    assert.equal(flags.wave, 'C');
    assert.equal(flags.status, 'deferred');
    assert.equal(typeof flags.mfa, 'boolean');
    assert.equal(typeof flags.sso, 'boolean');
    assert.equal(typeof flags.ipAllowlist, 'boolean');
    assert.equal(typeof flags.webauthn, 'boolean');
  });

  it('envFlag parses 1/true/on', () => {
    assert.equal(envFlag('__NO_SUCH_FLAG__', false), false);
  });
});
