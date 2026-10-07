const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { compareGatewayToken } = require('../middleware/compareGatewayToken');

describe('compareGatewayToken (Sec-Y2)', () => {
  it('accepts identical tokens', () => {
    assert.equal(compareGatewayToken('secret-token', 'secret-token'), true);
  });

  it('trims whitespace like the legacy header read', () => {
    assert.equal(compareGatewayToken('  secret-token ', 'secret-token'), true);
  });

  it('rejects a different token of the same length', () => {
    assert.equal(compareGatewayToken('secret-tokeX', 'secret-token'), false);
  });

  it('rejects a different-length token without throwing', () => {
    assert.equal(compareGatewayToken('short', 'a-much-longer-secret-token'), false);
    assert.equal(compareGatewayToken('a-much-longer-secret-token-xx', 'short'), false);
  });

  it('rejects missing got or expected', () => {
    assert.equal(compareGatewayToken('', 'secret-token'), false);
    assert.equal(compareGatewayToken(undefined, 'secret-token'), false);
    assert.equal(compareGatewayToken('secret-token', ''), false);
    assert.equal(compareGatewayToken(null, null), false);
  });

  it('uses crypto.timingSafeEqual', () => {
    const src = readFileSync(join(__dirname, '../middleware/compareGatewayToken.js'), 'utf8');
    assert.match(src, /timingSafeEqual/);
  });
});
