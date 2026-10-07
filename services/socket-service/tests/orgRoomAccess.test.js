const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { assertOrgChannelSocketAccess } = require('../src/utils/orgRoomAccess');

describe('assertOrgChannelSocketAccess', () => {
  let prevOrgUrl;
  let prevToken;

  beforeEach(() => {
    prevOrgUrl = process.env.ORGANIZATION_SERVICE_URL;
    prevToken = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.ORGANIZATION_SERVICE_URL = 'http://org-service:3004';
    process.env.GATEWAY_INTERNAL_TOKEN = 'gw-test-token';
  });

  afterEach(() => {
    if (prevOrgUrl === undefined) delete process.env.ORGANIZATION_SERVICE_URL;
    else process.env.ORGANIZATION_SERVICE_URL = prevOrgUrl;
    if (prevToken === undefined) delete process.env.GATEWAY_INTERNAL_TOKEN;
    else process.env.GATEWAY_INTERNAL_TOKEN = prevToken;
  });

  it('cho phép khi data.canRead true dù allowed (canVoice) false', async () => {
    const calls = [];
    const httpGet = async (url, opts) => {
      calls.push({ url, opts });
      return {
        status: 200,
        data: { success: true, data: { allowed: false, canRead: true, canVoice: false } },
      };
    };
    const result = await assertOrgChannelSocketAccess(
      { userId: 'u1', organizationId: 'o1', channelId: 'c1' },
      { httpGet }
    );
    assert.equal(result.allowed, true);
    assert.equal(result.reason, null);
    assert.match(calls[0].url, /\/internal\/voice-channel-access\//);
    assert.equal(calls[0].opts.headers['x-gateway-internal-token'], 'gw-test-token');
  });

  it('deny khi canRead false', async () => {
    const httpGet = async () => ({
      status: 200,
      data: { success: true, data: { allowed: true, canRead: false, canVoice: true } },
    });
    const result = await assertOrgChannelSocketAccess(
      { userId: 'u1', organizationId: 'o1', channelId: 'c1' },
      { httpGet }
    );
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'read_denied');
  });

  it('deny khi thiếu GATEWAY_INTERNAL_TOKEN', async () => {
    delete process.env.GATEWAY_INTERNAL_TOKEN;
    const httpGet = async () => {
      throw new Error('should not call');
    };
    const result = await assertOrgChannelSocketAccess(
      { userId: 'u1', organizationId: 'o1', channelId: 'c1' },
      { httpGet }
    );
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'gateway_trust_not_configured');
  });

  it('deny khi thiếu context', async () => {
    const result = await assertOrgChannelSocketAccess({
      userId: '',
      organizationId: 'o1',
      channelId: 'c1',
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'missing_context');
  });
});
