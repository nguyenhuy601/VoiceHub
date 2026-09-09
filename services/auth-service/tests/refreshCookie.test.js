const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('refreshCookie helpers', () => {
  const savedEnv = {};

  beforeEach(() => {
    for (const key of [
      'AUTH_REFRESH_COOKIE_NAME',
      'AUTH_REFRESH_COOKIE_PATH',
      'AUTH_REFRESH_COOKIE_SECURE',
      'AUTH_SESSION_MARKER_COOKIE_NAME',
      'NODE_ENV',
    ]) {
      savedEnv[key] = process.env[key];
    }
    delete require.cache[require.resolve('../src/utils/refreshCookie')];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve('../src/utils/refreshCookie')];
  });

  it('isCookieSecure trusts X-Forwarded-Proto=https', () => {
    delete process.env.AUTH_REFRESH_COOKIE_SECURE;
    process.env.NODE_ENV = 'development';
    const { isCookieSecure } = require('../src/utils/refreshCookie');
    assert.equal(
      isCookieSecure({ headers: { 'x-forwarded-proto': 'https' }, secure: false }),
      true
    );
    assert.equal(
      isCookieSecure({ headers: { 'x-forwarded-proto': 'http' }, secure: false }),
      false
    );
  });

  it('isCookieSecure respects AUTH_REFRESH_COOKIE_SECURE override', () => {
    process.env.AUTH_REFRESH_COOKIE_SECURE = 'false';
    process.env.NODE_ENV = 'production';
    const { isCookieSecure } = require('../src/utils/refreshCookie');
    assert.equal(
      isCookieSecure({ headers: { 'x-forwarded-proto': 'https' }, secure: true }),
      false
    );
  });

  it('setRefreshCookie sets HttpOnly refresh + non-HttpOnly session marker', () => {
    delete process.env.AUTH_REFRESH_COOKIE_SECURE;
    process.env.NODE_ENV = 'development';
    const {
      setRefreshCookie,
      getRefreshCookieName,
      getSessionMarkerCookieName,
      SESSION_MARKER_VALUE,
    } = require('../src/utils/refreshCookie');

    const cookies = [];
    const res = {
      cookie(name, value, options) {
        cookies.push({ name, value, options });
      },
    };
    const req = { headers: { 'x-forwarded-proto': 'https' }, secure: false };

    setRefreshCookie(res, 'opaque-refresh-raw', req);

    assert.equal(cookies.length, 2);
    const refresh = cookies.find((c) => c.name === getRefreshCookieName());
    const marker = cookies.find((c) => c.name === getSessionMarkerCookieName());
    assert.ok(refresh);
    assert.ok(marker);
    assert.equal(refresh.value, 'opaque-refresh-raw');
    assert.equal(refresh.options.httpOnly, true);
    assert.equal(refresh.options.secure, true);
    assert.equal(refresh.options.sameSite, 'strict');
    assert.equal(refresh.options.path, '/api/auth');
    assert.equal(refresh.options.maxAge, undefined);
    assert.equal(refresh.options.expires, undefined);
    assert.equal(marker.value, SESSION_MARKER_VALUE);
    assert.equal(marker.options.httpOnly, false);
    assert.equal(marker.options.path, '/');
  });

  it('clearRefreshCookie clears refresh, marker Path=/, and legacy marker Path=/api/auth', () => {
    const { clearRefreshCookie, getRefreshCookieName, getSessionMarkerCookieName } = require(
      '../src/utils/refreshCookie'
    );
    const cleared = [];
    const res = {
      clearCookie(name, options) {
        cleared.push({ name, options });
      },
    };
    clearRefreshCookie(res, { headers: { 'x-forwarded-proto': 'https' } });
    assert.equal(cleared.length, 3);
    assert.ok(
      cleared.some((c) => c.name === getRefreshCookieName() && c.options.path === '/api/auth')
    );
    assert.ok(
      cleared.some(
        (c) => c.name === getSessionMarkerCookieName() && c.options.path === '/'
      )
    );
    assert.ok(
      cleared.some(
        (c) => c.name === getSessionMarkerCookieName() && c.options.path === '/api/auth'
      )
    );
  });

  it('shouldClearCookiesOnRefreshFailure only for AUTH_REFRESH_INVALID', () => {
    const { shouldClearCookiesOnRefreshFailure } = require('../src/utils/refreshCookie');
    assert.equal(shouldClearCookiesOnRefreshFailure({ errorCode: 'AUTH_REFRESH_INVALID' }), true);
    assert.equal(shouldClearCookiesOnRefreshFailure({ errorCode: 'AUTH_REFRESH_FAILED' }), false);
    assert.equal(shouldClearCookiesOnRefreshFailure({ errorCode: 'AUTH_DB_UNAVAILABLE', statusCode: 503 }), false);
    assert.equal(shouldClearCookiesOnRefreshFailure(new Error('mongo timeout')), false);
    assert.equal(shouldClearCookiesOnRefreshFailure(null), false);
  });

  it('readRefreshTokenFromReq reads cookie-parser or Cookie header', () => {
    const { readRefreshTokenFromReq, getRefreshCookieName } = require('../src/utils/refreshCookie');
    const name = getRefreshCookieName();
    assert.equal(readRefreshTokenFromReq({ cookies: { [name]: 'from-parser' } }), 'from-parser');
    assert.equal(
      readRefreshTokenFromReq({
        cookies: {},
        headers: { cookie: `${name}=from-header; other=1` },
      }),
      'from-header'
    );
    assert.equal(readRefreshTokenFromReq({ cookies: {}, headers: {} }), null);
  });
});
