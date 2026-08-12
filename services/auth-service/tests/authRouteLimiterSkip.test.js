const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldSkipAuthRouteRateLimit,
} = require('../src/utils/shouldSkipAuthRouteRateLimit');

describe('shouldSkipAuthRouteRateLimit', () => {
  it('skips when path is /internal after /api/auth mount', () => {
    assert.equal(
      shouldSkipAuthRouteRateLimit({ path: '/internal/provision' }),
      true
    );
    assert.equal(
      shouldSkipAuthRouteRateLimit({ path: '/internal/deprovision' }),
      true
    );
    assert.equal(
      shouldSkipAuthRouteRateLimit({ path: '/internal/provision-set-password-email' }),
      true
    );
  });

  it('skips when originalUrl contains /api/auth/internal', () => {
    assert.equal(
      shouldSkipAuthRouteRateLimit({
        path: '/',
        originalUrl: '/api/auth/internal/provision',
      }),
      true
    );
    assert.equal(
      shouldSkipAuthRouteRateLimit({
        url: '/api/auth/internal/users-auth-summary?x=1',
      }),
      true
    );
  });

  it('does not skip public auth paths', () => {
    assert.equal(shouldSkipAuthRouteRateLimit({ path: '/login' }), false);
    assert.equal(shouldSkipAuthRouteRateLimit({ path: '/register' }), false);
    assert.equal(
      shouldSkipAuthRouteRateLimit({
        path: '/login',
        originalUrl: '/api/auth/login',
      }),
      false
    );
    assert.equal(
      shouldSkipAuthRouteRateLimit({
        originalUrl: '/api/auth/refresh-token',
      }),
      false
    );
  });

  it('does not skip empty or unrelated paths', () => {
    assert.equal(shouldSkipAuthRouteRateLimit({}), false);
    assert.equal(shouldSkipAuthRouteRateLimit({ path: '/health' }), false);
    assert.equal(
      shouldSkipAuthRouteRateLimit({ originalUrl: '/api/users/internal/bootstrap' }),
      false
    );
  });
});
