const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const {
  PATHS,
  setMock,
  clearMocks,
  installAuthServiceMocks,
  makeUser,
  mockRes,
} = require('./helpers/authServiceMocks');
const { hashOneTimeToken, oneTimeTokenQuery, readTokenInput } = require('../src/utils/oneTimeToken');
const { createSensitiveAuthLimiter } = require('../src/middleware/sensitiveAuthLimiter');

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

describe('oneTimeToken helpers', () => {
  it('readTokenInput accepts only trimmed strings of 1..256 chars', () => {
    assert.equal(readTokenInput(' abc '), 'abc');
    assert.equal(readTokenInput({ $ne: null }), null);
    assert.equal(readTokenInput(['a']), null);
    assert.equal(readTokenInput(123), null);
    assert.equal(readTokenInput('   '), null);
    assert.equal(readTokenInput('a'.repeat(257)), null);
    assert.equal(readTokenInput('a'.repeat(256)).length, 256);
  });

  it('hashOneTimeToken is SHA-256 hex and query matches hash or legacy raw', () => {
    assert.equal(hashOneTimeToken('raw-token'), sha256('raw-token'));
    assert.deepStrictEqual(oneTimeTokenQuery('raw-token'), { $in: [sha256('raw-token'), 'raw-token'] });
  });
});

describe('auth.service one-time tokens', () => {
  let state;

  beforeEach(() => {
    state = { users: [] };
    installAuthServiceMocks(state);
  });

  afterEach(() => clearMocks());

  it('forgotPassword stores the SHA-256 hash and emails the raw token', async () => {
    const user = makeUser();
    state.users = [user];
    state.emailAvailable = true;
    const authService = require(PATHS.authService);
    await authService.forgotPassword('real@example.com', 'https://voicehub.local');
    const rawSent = state.sentReset[1];
    assert.match(rawSent, /^[a-f0-9]{64}$/);
    assert.equal(user.passwordResetToken, sha256(rawSent));
    assert.notEqual(user.passwordResetToken, rawSent);
  });

  it('resetPassword looks up by { $in: [hash, raw] }', async () => {
    const authService = require(PATHS.authService);
    await assert.rejects(() => authService.resetPassword('tok123', 'NewPass1!'), (err) => {
      assert.equal(err.errorCode, 'AUTH_RESET_TOKEN_INVALID');
      return true;
    });
    assert.deepStrictEqual(state.findOneQueries[0].passwordResetToken, { $in: [sha256('tok123'), 'tok123'] });
  });

  it('resetPassword / verifyEmail reject operator objects without querying the DB', async () => {
    const authService = require(PATHS.authService);
    await assert.rejects(
      () => authService.resetPassword({ $ne: null }, 'NewPass1!'),
      (err) => err.errorCode === 'AUTH_INVALID_TOKEN'
    );
    await assert.rejects(
      () => authService.verifyEmail({ $gt: '' }),
      (err) => err.errorCode === 'AUTH_INVALID_TOKEN'
    );
    assert.equal(state.findOneQueries.length, 0);
  });
});

describe('auth.controller token input', () => {
  let serviceCalls;

  beforeEach(() => {
    clearMocks();
    serviceCalls = 0;
    const count = async () => {
      serviceCalls += 1;
      return {};
    };
    setMock(PATHS.authService, { resetPassword: count, verifyEmail: count, verifyEmailChange: count });
    setMock(PATHS.adminUserService, { recordLoginEvent: async () => {} });
    setMock(PATHS.email, { isAvailable: () => false });
    setMock(PATHS.shared, { resolveFrontendUrl: () => 'https://voicehub.local' });
    setMock(PATHS.sharedEmailPii, { readEmailFromStored: (v) => v });
  });

  afterEach(() => clearMocks());

  it('rejects non-string / oversized tokens with 400 AUTH_INVALID_TOKEN before the service', async () => {
    const controller = require(PATHS.controller);
    const res1 = mockRes();
    await controller.resetPassword({ body: { resetToken: { $ne: null }, newPassword: 'NewPass1!' }, query: {} }, res1);
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.errorCode, 'AUTH_INVALID_TOKEN');
    const res2 = mockRes();
    await controller.verifyEmail({ query: { token: ['a', 'b'] }, body: {}, method: 'GET', path: '/x' }, res2);
    assert.equal(res2.body.errorCode, 'AUTH_INVALID_TOKEN');
    const res3 = mockRes();
    await controller.verifyEmailChange({ query: { token: 'x'.repeat(300) }, body: {} }, res3);
    assert.equal(res3.body.errorCode, 'AUTH_INVALID_TOKEN');
    assert.equal(serviceCalls, 0);
  });
});

describe('refreshTokenMatches', () => {
  beforeEach(() => {
    clearMocks();
    setMock(PATHS.jwt, { JWT_REFRESH_SECRET: 'test-refresh-secret' });
  });
  afterEach(() => {
    clearMocks();
    delete require.cache[require.resolve('../src/utils/refreshTokenHash')];
  });

  it('matches hashed and legacy tokens and rejects different lengths', () => {
    delete require.cache[require.resolve('../src/utils/refreshTokenHash')];
    const { hashRefreshToken, refreshTokenMatches } = require('../src/utils/refreshTokenHash');
    assert.equal(refreshTokenMatches({ refreshToken: hashRefreshToken('abc') }, 'abc'), true);
    assert.equal(refreshTokenMatches({ refreshToken: 'legacy-raw' }, 'legacy-raw'), true);
    assert.equal(refreshTokenMatches({ refreshToken: hashRefreshToken('abc') }, 'abcd'), false);
    assert.equal(refreshTokenMatches({ refreshToken: 'short' }, 'much-longer-token'), false);
  });
});

describe('sensitiveAuthLimiter', () => {
  it('returns 429 AUTH_RATE_LIMITED after max requests per IP and keeps other IPs unaffected', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.post('/forgot', createSensitiveAuthLimiter({ AUTH_SENSITIVE_RATE_MAX: '2', AUTH_SENSITIVE_RATE_WINDOW_MS: '60000' }), (req, res) =>
      res.json({ ok: true })
    );
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${server.address().port}/forgot`;
    const hit = (ip) => fetch(url, { method: 'POST', headers: { 'x-forwarded-for': ip } });
    try {
      assert.equal((await hit('198.51.100.1')).status, 200);
      assert.equal((await hit('198.51.100.1')).status, 200);
      const limited = await hit('198.51.100.1');
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).errorCode, 'AUTH_RATE_LIMITED');
      assert.equal((await hit('198.51.100.2')).status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
