const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('assertCanCreateOrganization', () => {
  const saved = {};

  beforeEach(() => {
    saved.SINGLE_ORG_MODE = process.env.SINGLE_ORG_MODE;
    saved.GATEWAY_INTERNAL_TOKEN = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.SINGLE_ORG_MODE = 'true';
    process.env.GATEWAY_INTERNAL_TOKEN = 'seed-token';
    delete require.cache[require.resolve('../src/utils/singleCompanyPolicy')];
  });

  afterEach(() => {
    if (saved.SINGLE_ORG_MODE === undefined) delete process.env.SINGLE_ORG_MODE;
    else process.env.SINGLE_ORG_MODE = saved.SINGLE_ORG_MODE;
    if (saved.GATEWAY_INTERNAL_TOKEN === undefined) delete process.env.GATEWAY_INTERNAL_TOKEN;
    else process.env.GATEWAY_INTERNAL_TOKEN = saved.GATEWAY_INTERNAL_TOKEN;
    delete require.cache[require.resolve('../src/utils/singleCompanyPolicy')];
  });

  it('blocks create when org already exists', async () => {
    const Organization = require('../src/models/Organization');
    const original = Organization.countDocuments;
    Organization.countDocuments = async () => 1;

    const { assertCanCreateOrganization } = require('../src/utils/singleCompanyPolicy');
    let statusCode;
    let errorCode;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        errorCode = payload?.errorCode;
        return this;
      },
    };
    const ok = await assertCanCreateOrganization({ headers: {} }, res, (_r, _msg, code) => {
      _r.status(409);
      _r.json({ errorCode: code });
    });
    assert.equal(ok, false);
    assert.equal(statusCode, 409);
    assert.equal(errorCode, 'ORG_SINGLE_TENANT');

    Organization.countDocuments = original;
  });

  it('allows internal seed request even when org exists', async () => {
    const Organization = require('../src/models/Organization');
    const original = Organization.countDocuments;
    Organization.countDocuments = async () => 2;

    const { assertCanCreateOrganization } = require('../src/utils/singleCompanyPolicy');
    const ok = await assertCanCreateOrganization(
      { headers: { 'x-internal-token': 'seed-token' } },
      {},
      () => {}
    );
    assert.equal(ok, true);

    Organization.countDocuments = original;
  });
});
