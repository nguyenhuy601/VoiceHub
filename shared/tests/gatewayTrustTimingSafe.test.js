const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const internalGatewayAuth = require('../middleware/internalGatewayAuth');
const {
  gatewayUserFromTrustedHeaders,
  isTrustedGatewayForward,
} = require('../middleware/gatewayTrust');

const TOKEN = 'unit-gateway-token';

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function run(mw, headers) {
  const req = { headers };
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

describe('gateway trust timing-safe compare (Sec-Y2)', () => {
  let savedToken;
  let savedConsoleError;

  beforeEach(() => {
    savedToken = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.GATEWAY_INTERNAL_TOKEN = TOKEN;
    savedConsoleError = console.error;
    console.error = () => {};
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.GATEWAY_INTERNAL_TOKEN;
    else process.env.GATEWAY_INTERNAL_TOKEN = savedToken;
    console.error = savedConsoleError;
  });

  it('internalGatewayAuth passes with the right token (both header aliases)', () => {
    assert.equal(run(internalGatewayAuth, { 'x-gateway-internal-token': TOKEN }).nextCalled, true);
    assert.equal(run(internalGatewayAuth, { 'x-internal-token': TOKEN }).nextCalled, true);
  });

  it('internalGatewayAuth rejects wrong / different-length token with 401 GATEWAY_TRUST_INVALID', () => {
    for (const bad of ['unit-gateway-tokeX', 'x', `${TOKEN}-longer`, '']) {
      const { res, nextCalled } = run(internalGatewayAuth, { 'x-gateway-internal-token': bad });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.errorCode, 'GATEWAY_TRUST_INVALID');
    }
  });

  it('internalGatewayAuth returns 503 when token not configured', () => {
    delete process.env.GATEWAY_INTERNAL_TOKEN;
    const { res, nextCalled } = run(internalGatewayAuth, { 'x-gateway-internal-token': TOKEN });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.errorCode, 'GATEWAY_TRUST_NOT_CONFIGURED');
  });

  it('gatewayUserFromTrustedHeaders trusts x-user-id only with the right token', () => {
    const ok = run(gatewayUserFromTrustedHeaders, {
      'x-user-id': 'u1',
      'x-gateway-internal-token': TOKEN,
    });
    assert.equal(ok.nextCalled, true);
    assert.equal(ok.req.user.id, 'u1');

    const bad = run(gatewayUserFromTrustedHeaders, {
      'x-user-id': 'u1',
      'x-gateway-internal-token': 'forged',
    });
    assert.equal(bad.nextCalled, false);
    assert.equal(bad.res.statusCode, 401);
    assert.equal(bad.res.body.errorCode, 'GATEWAY_TRUST_INVALID');
    assert.equal(bad.req.user, undefined);
  });

  it('isTrustedGatewayForward is true only for the exact token', () => {
    assert.equal(isTrustedGatewayForward({ headers: { 'x-gateway-internal-token': TOKEN } }), true);
    assert.equal(isTrustedGatewayForward({ headers: { 'x-internal-token': TOKEN } }), true);
    assert.equal(isTrustedGatewayForward({ headers: { 'x-gateway-internal-token': 'nope' } }), false);
    assert.equal(isTrustedGatewayForward({ headers: {} }), false);
  });

  it('trust middleware no longer compares tokens with === / !==', () => {
    for (const file of ['internalGatewayAuth.js', 'gatewayTrust.js']) {
      const src = readFileSync(join(__dirname, '../middleware', file), 'utf8');
      assert.doesNotMatch(src, /got\s*[!=]==\s*expected/);
      assert.match(src, /compareGatewayToken/);
    }
  });
});
