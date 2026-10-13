const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { trustedFrontendUrl, isAllowedOrigin } = require('../utils/trustedFrontendUrl');

describe('trustedFrontendUrl', () => {
  it('rejects evil Origin and falls back to FRONTEND_URL', () => {
    const env = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://voicehub.local',
      CORS_ORIGIN: 'https://voicehub.local',
    };
    const req = { headers: { origin: 'https://evil.example' } };
    assert.equal(trustedFrontendUrl(req, env), 'https://voicehub.local');
    assert.equal(isAllowedOrigin('https://evil.example', env), false);
  });

  it('allows voicehub.local Origin', () => {
    const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://app.example.com' };
    const req = { headers: { origin: 'https://voicehub.local' } };
    assert.equal(trustedFrontendUrl(req, env), 'https://voicehub.local');
  });
});
