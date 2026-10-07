const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
  SEARCH_PATHS,
  rateLimitKey,
  isSearchRequest,
} = require('../src/middlewares/rateLimiters');

const appSrc = readFileSync(join(__dirname, '../src/app.js'), 'utf8');
const routesSrc = readFileSync(join(__dirname, '../src/routes/index.js'), 'utf8');

describe('gateway rate-limit mount (Sec-Y2)', () => {
  it('covers user + message search paths', () => {
    assert.equal(SEARCH_PATHS.has('/api/users/search'), true);
    assert.equal(SEARCH_PATHS.has('/api/messages/search'), true);
  });

  it('applies the search limiter only to GET search paths', () => {
    assert.equal(isSearchRequest({ method: 'GET', path: '/api/users/search' }), true);
    assert.equal(isSearchRequest({ method: 'GET', path: '/api/messages/search' }), true);
    assert.equal(isSearchRequest({ method: 'POST', path: '/api/users/search' }), false);
    assert.equal(isSearchRequest({ method: 'GET', path: '/api/users/me' }), false);
  });

  it('keys by IP, adding userId once the JWT is verified', () => {
    assert.equal(rateLimitKey({ ip: '10.0.0.1' }), '10.0.0.1');
    assert.equal(rateLimitKey({ ip: '10.0.0.1', user: { id: 'u1' } }), '10.0.0.1:u1');
    assert.notEqual(
      rateLimitKey({ ip: '10.0.0.1', user: { id: 'u1' } }),
      rateLimitKey({ ip: '10.0.0.1', user: { id: 'u2' } })
    );
  });

  it('mounts searchLimiter right after authMiddleware in routes', () => {
    const authIdx = routesSrc.indexOf('router.use(authMiddleware)');
    const searchIdx = routesSrc.indexOf('router.use(searchLimiter)');
    const proxyIdx = routesSrc.indexOf('proxyMiddleware(req, res, next)');
    assert.ok(authIdx >= 0 && searchIdx > authIdx && proxyIdx > searchIdx);
  });

  it('login / refresh / upload limiters use the shared keyGenerator', () => {
    const matches = appSrc.match(/keyGenerator:\s*rateLimitKey/g) || [];
    assert.equal(matches.length, 3);
    for (const path of ["'/api/auth/login'", "'/api/auth/refresh-token'", "'/uploads'"]) {
      assert.ok(appSrc.includes(path), `missing limiter mount for ${path}`);
    }
  });

  it('strips spoofed forward headers before any rate limiter runs', () => {
    const stripIdx = appSrc.indexOf('app.use(stripSpoofedForwardHeaders)');
    const limiterIdx = appSrc.indexOf('app.use(apiLimiter)');
    assert.ok(stripIdx >= 0 && limiterIdx > stripIdx);
  });
});
