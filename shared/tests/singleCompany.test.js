const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('singleCompany config', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of ['SINGLE_ORG_MODE', 'ALLOW_PUBLIC_REGISTER', 'GATEWAY_INTERNAL_TOKEN']) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve('../config/singleCompany')];
  });

  function load() {
    delete require.cache[require.resolve('../config/singleCompany')];
    return require('../config/singleCompany');
  }

  it('isSingleOrgMode true when SINGLE_ORG_MODE=true', () => {
    process.env.SINGLE_ORG_MODE = 'true';
    const { isSingleOrgMode } = load();
    assert.equal(isSingleOrgMode(), true);
  });

  it('isPublicRegisterAllowed false when ALLOW_PUBLIC_REGISTER=false', () => {
    process.env.ALLOW_PUBLIC_REGISTER = 'false';
    const { isPublicRegisterAllowed } = load();
    assert.equal(isPublicRegisterAllowed(), false);
  });

  it('isPublicRegisterAllowed false by default when single org mode', () => {
    process.env.SINGLE_ORG_MODE = 'true';
    delete process.env.ALLOW_PUBLIC_REGISTER;
    const { isPublicRegisterAllowed } = load();
    assert.equal(isPublicRegisterAllowed(), false);
  });

  it('isInternalSeedRequest matches x-internal-token', () => {
    process.env.GATEWAY_INTERNAL_TOKEN = 'test-internal-token';
    const { isInternalSeedRequest } = load();
    assert.equal(
      isInternalSeedRequest({ headers: { 'x-internal-token': 'test-internal-token' } }),
      true
    );
    assert.equal(isInternalSeedRequest({ headers: { 'x-internal-token': 'wrong' } }), false);
  });
});
