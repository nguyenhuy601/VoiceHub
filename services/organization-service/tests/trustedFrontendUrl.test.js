const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { trustedFrontendUrl } = require('../src/utils/trustedFrontendUrl');

const PROD_ENV = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://app.voicehub.vn/some/path',
  CORS_ORIGIN: 'https://app.voicehub.vn, https://admin.voicehub.vn',
};

function req(headers) {
  return { headers };
}

describe('trustedFrontendUrl (RULE-13)', () => {
  it('keeps allowlisted Origin', () => {
    assert.equal(trustedFrontendUrl(req({ origin: 'https://admin.voicehub.vn' }), PROD_ENV), 'https://admin.voicehub.vn');
    assert.equal(trustedFrontendUrl(req({ origin: 'https://voicehub.local' }), PROD_ENV), 'https://voicehub.local');
  });

  it('replaces foreign Origin / Referer with FRONTEND_URL origin', () => {
    assert.equal(trustedFrontendUrl(req({ origin: 'https://evil.example' }), PROD_ENV), 'https://app.voicehub.vn');
    assert.equal(
      trustedFrontendUrl(req({ referer: 'https://evil.example/phish?x=1' }), PROD_ENV),
      'https://app.voicehub.vn'
    );
  });

  it('rejects non-http schemes', () => {
    assert.equal(trustedFrontendUrl(req({ origin: 'javascript:alert(1)' }), PROD_ENV), 'https://app.voicehub.vn');
  });

  it('localhost only allowed outside production', () => {
    const local = req({ origin: 'http://localhost:5173' });
    assert.equal(trustedFrontendUrl(local, PROD_ENV), 'https://app.voicehub.vn');
    assert.equal(trustedFrontendUrl(local, { ...PROD_ENV, NODE_ENV: 'development' }), 'http://localhost:5173');
  });

  it('falls back to first CORS origin when FRONTEND_URL missing', () => {
    const env = { NODE_ENV: 'production', CORS_ORIGIN: 'https://a.vn,https://b.vn' };
    assert.equal(trustedFrontendUrl(req({ origin: 'https://evil.example' }), env), 'https://a.vn');
  });
});
