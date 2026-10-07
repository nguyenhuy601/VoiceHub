const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveUserIdFromReq } = require('../src/utils/orgAclCacheRead');
const { headersForOrganizationForward } = require('../src/utils/organizationForwardHeaders');

describe('resolveUserIdFromReq', () => {
  it('ưu tiên req.user', () => {
    assert.equal(
      resolveUserIdFromReq({ user: { id: 'u1' }, headers: { 'x-user-id': 'spoof' } }),
      'u1'
    );
  });

  it('không tin x-user-id khi không trusted gateway', () => {
    assert.equal(
      resolveUserIdFromReq({
        headers: {
          'x-user-id': 'spoof-user',
          'x-gateway-internal-token': 'wrong',
        },
      }),
      ''
    );
  });
});

describe('headersForOrganizationForward', () => {
  it('không copy header client khi thiếu GATEWAY_INTERNAL_TOKEN', () => {
    const prev = process.env.GATEWAY_INTERNAL_TOKEN;
    delete process.env.GATEWAY_INTERNAL_TOKEN;
    try {
      const headers = headersForOrganizationForward({
        user: { id: 'u1' },
        headers: {
          'x-user-id': 'spoof',
          'x-gateway-internal-token': 'client-tok',
          authorization: 'Bearer abc',
        },
      });
      assert.equal(headers['x-user-id'], undefined);
      assert.equal(headers['x-gateway-internal-token'], undefined);
      assert.equal(headers.Authorization, 'Bearer abc');
    } finally {
      if (prev === undefined) delete process.env.GATEWAY_INTERNAL_TOKEN;
      else process.env.GATEWAY_INTERNAL_TOKEN = prev;
    }
  });
});

describe('chatTrust source-contract', () => {
  it('routes dùng compareGatewayToken', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/routes/message.routes.js'),
      'utf8'
    );
    assert.ok(src.includes('compareGatewayToken'));
    assert.equal(src.includes('timingSafeTokenEquals'), false);
  });

  it('controller không định nghĩa headersForOrganizationForward cục bộ', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/message.controller.js'),
      'utf8'
    );
    assert.ok(src.includes("require('../utils/organizationForwardHeaders')"));
    assert.equal(src.includes('function headersForOrganizationForward'), false);
  });

  it('delete/recall emit room:message_* khi có roomId', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/message.controller.js'),
      'utf8'
    );
    assert.ok(src.includes("event: 'room:message_deleted'"));
    assert.ok(src.includes("event: 'room:message_recalled'"));
    assert.ok(src.includes("event: 'room:message_edited'"));
  });
});
