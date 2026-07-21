const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('session revocation helpers', () => {
  const savedEnv = {};
  const redisConfigPath = (() => {
    try {
      return require.resolve('@enterprise/shared/config/redis');
    } catch {
      return null;
    }
  })();

  beforeEach(() => {
    for (const key of ['JWT_REFRESH_SECRET', 'REFRESH_TOKEN_PEPPER', 'JWT_REFRESH_EXPIRES_IN']) {
      savedEnv[key] = process.env[key];
    }
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-unit';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    delete require.cache[require.resolve('../src/config/jwt')];
    delete require.cache[require.resolve('../src/utils/refreshTokenHash')];
    delete require.cache[require.resolve('../src/utils/jwtDuration')];
    delete require.cache[require.resolve('../src/utils/tokenVersion')];

    // Avoid real Redis connections in unit tests (keep event loop clean).
    if (redisConfigPath) {
      require.cache[redisConfigPath] = {
        exports: {
          getRedisClient: () => null,
        },
      };
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve('../src/config/jwt')];
    delete require.cache[require.resolve('../src/utils/refreshTokenHash')];
    delete require.cache[require.resolve('../src/utils/jwtDuration')];
    delete require.cache[require.resolve('../src/utils/tokenVersion')];

    if (redisConfigPath && require.cache[redisConfigPath]) {
      delete require.cache[redisConfigPath];
    }
  });

  it('hashRefreshToken is stable and refreshTokenMatches supports legacy plaintext', () => {
    const { hashRefreshToken, refreshTokenMatches } = require('../src/utils/refreshTokenHash');
    const raw = 'refresh-jwt-example';
    const hash = hashRefreshToken(raw);
    assert.ok(hash.length === 64);
    assert.equal(hashRefreshToken(raw), hash);

    assert.equal(refreshTokenMatches({ refreshToken: raw }, raw), true);
    assert.equal(refreshTokenMatches({ refreshToken: hash }, raw), true);
    assert.equal(refreshTokenMatches({ refreshToken: hash }, 'other'), false);
  });

  it('parseJwtDurationToMs reads refresh env', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    delete require.cache[require.resolve('../src/config/jwt')];
    delete require.cache[require.resolve('../src/utils/jwtDuration')];
    const { getRefreshTokenTtlMs } = require('../src/utils/jwtDuration');
    assert.equal(getRefreshTokenTtlMs(), 7 * 24 * 60 * 60 * 1000);
  });

  it('bumpTokenVersion increments tv on userAuth', async () => {
    const { bumpTokenVersion, accessTokenPayload } = require('../src/utils/tokenVersion');
    const userAuth = { userId: 'abc', tokenVersion: 2, systemRole: 'employee', mustChangePassword: false };
    const next = await bumpTokenVersion(userAuth);
    assert.equal(next, 3);
    assert.equal(userAuth.tokenVersion, 3);
    const payload = accessTokenPayload(userAuth, 'a@b.com');
    assert.equal(payload.tv, 3);
    assert.equal(payload.email, 'a@b.com');
  });
});
