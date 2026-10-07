const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const internalGatewayAuth = require('../src/middleware/internalGatewayAuth');

const TOKEN = 'rps-unit-gateway-token';

function run(headers) {
  const res = {
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
  let nextCalled = false;
  internalGatewayAuth({ headers }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe('RPS internalGatewayAuth timing-safe (Sec-Y2b)', () => {
  let saved;

  beforeEach(() => {
    saved = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.GATEWAY_INTERNAL_TOKEN = TOKEN;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.GATEWAY_INTERNAL_TOKEN;
    else process.env.GATEWAY_INTERNAL_TOKEN = saved;
  });

  it('passes with the exact token', () => {
    assert.equal(run({ 'x-gateway-internal-token': TOKEN }).nextCalled, true);
  });

  it('rejects wrong, different-length and missing tokens with 401', () => {
    for (const bad of ['rps-unit-gateway-tokeX', 'x', `${TOKEN}-longer`, '']) {
      const { res, nextCalled } = run({ 'x-gateway-internal-token': bad });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { success: false, message: 'Unauthorized' });
    }
  });

  it('only trusts x-gateway-internal-token (no x-internal-token alias)', () => {
    const { res, nextCalled } = run({ 'x-internal-token': TOKEN });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('returns 503 when the token is not configured', () => {
    delete process.env.GATEWAY_INTERNAL_TOKEN;
    const { res, nextCalled } = run({ 'x-gateway-internal-token': TOKEN });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
  });

  it('uses compareGatewayToken instead of !==', () => {
    const src = readFileSync(join(__dirname, '../src/middleware/internalGatewayAuth.js'), 'utf8');
    assert.match(src, /compareGatewayToken/);
    assert.doesNotMatch(src, /got\s*!==\s*expected/);
  });
});
