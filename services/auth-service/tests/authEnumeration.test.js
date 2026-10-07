const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  PATHS,
  setMock,
  clearMocks,
  installAuthServiceMocks,
  makeUser,
  mockRes,
} = require('./helpers/authServiceMocks');

async function loginError(authService, email, password) {
  try {
    await authService.login(email, password);
  } catch (err) {
    return err;
  }
  assert.fail('login should reject');
}

describe('login does not reveal whether an account exists', () => {
  let state;

  beforeEach(() => {
    state = { users: [] };
    installAuthServiceMocks(state);
  });

  afterEach(() => clearMocks());

  it('unknown email -> AUTH_INVALID_CREDENTIALS and still runs bcrypt once', async () => {
    const authService = require(PATHS.authService);
    const err = await loginError(authService, 'ghost@example.com', 'Whatever1!');
    assert.equal(err.statusCode, 401);
    assert.equal(err.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(state.compareCalls, 1);
  });

  it('existing active user with wrong password -> same error as unknown email', async () => {
    const user = makeUser();
    state.users = [user];
    const authService = require(PATHS.authService);
    const unknown = await loginError(authService, 'ghost@example.com', 'Wrong1!xx');
    const wrong = await loginError(authService, 'real@example.com', 'Wrong1!xx');
    assert.equal(wrong.statusCode, unknown.statusCode);
    assert.equal(wrong.errorCode, unknown.errorCode);
    assert.equal(wrong.message, unknown.message);
    assert.equal(user.incCalls, 1);
  });

  it('pending account + wrong password -> AUTH_INVALID_CREDENTIALS with hidden attemptedUserId', async () => {
    state.users = [makeUser({ userId: 'u-pending', isEmailVerified: false, isActive: false })];
    const authService = require(PATHS.authService);
    const err = await loginError(authService, 'real@example.com', 'Wrong1!xx');
    assert.equal(err.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(err.attemptedUserId, 'u-pending');
    assert.equal(Object.keys(err).includes('attemptedUserId'), false);
    assert.equal(JSON.stringify(err).includes('u-pending'), false);
  });

  it('pending account + correct password -> AUTH_PENDING_ACTIVATION', async () => {
    state.users = [makeUser({ isEmailVerified: false, isActive: false })];
    const authService = require(PATHS.authService);
    const err = await loginError(authService, 'real@example.com', 'Correct1!');
    assert.equal(err.errorCode, 'AUTH_PENDING_ACTIVATION');
  });

  it('unverified (but active) account + correct password -> AUTH_EMAIL_NOT_VERIFIED', async () => {
    state.users = [makeUser({ isEmailVerified: false, isActive: true })];
    const authService = require(PATHS.authService);
    const err = await loginError(authService, 'real@example.com', 'Correct1!');
    assert.equal(err.errorCode, 'AUTH_EMAIL_NOT_VERIFIED');
  });

  it('inactive verified account + wrong password -> AUTH_INVALID_CREDENTIALS', async () => {
    state.users = [makeUser({ isActive: false })];
    const authService = require(PATHS.authService);
    const err = await loginError(authService, 'real@example.com', 'Wrong1!xx');
    assert.equal(err.errorCode, 'AUTH_INVALID_CREDENTIALS');
  });

  it('locked account -> AUTH_ACCOUNT_LOCKED before password check', async () => {
    state.users = [makeUser({ isLocked: true })];
    const authService = require(PATHS.authService);
    const err = await loginError(authService, 'real@example.com', 'Wrong1!xx');
    assert.equal(err.errorCode, 'AUTH_ACCOUNT_LOCKED');
    assert.equal(state.compareCalls, 0);
  });

  it('non-string or oversized password -> AUTH_INVALID_CREDENTIALS without bcrypt', async () => {
    state.users = [makeUser()];
    const authService = require(PATHS.authService);
    const objErr = await loginError(authService, 'real@example.com', { $ne: null });
    const longErr = await loginError(authService, 'real@example.com', 'a'.repeat(257));
    assert.equal(objErr.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(longErr.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(state.compareCalls, 0);
  });

  it('correct password on active account issues tokens', async () => {
    state.users = [makeUser()];
    const authService = require(PATHS.authService);
    const result = await authService.login('real@example.com', 'Correct1!');
    assert.equal(result.accessToken, 'access');
  });
});

describe('forgot / resend responses are identical for every account state', () => {
  let state;

  beforeEach(() => {
    state = { users: [] };
    installAuthServiceMocks(state);
  });

  afterEach(() => clearMocks());

  it('forgotPassword: unknown / existing / SMTP unavailable give the same body', async () => {
    state.users = [makeUser()];
    const authService = require(PATHS.authService);
    state.emailAvailable = false;
    const unknown = await authService.forgotPassword('ghost@example.com', 'https://voicehub.local');
    const existingNoSmtp = await authService.forgotPassword('real@example.com', 'https://voicehub.local');
    state.emailAvailable = true;
    const existingSmtp = await authService.forgotPassword(' REAL@example.com ', 'https://voicehub.local');
    assert.deepStrictEqual(existingNoSmtp, unknown);
    assert.deepStrictEqual(existingSmtp, unknown);
    assert.deepStrictEqual(Object.keys(unknown), ['message']);
    assert.equal(state.sentReset[0], 'real@example.com');
  });

  it('resendVerificationEmail: unknown / verified / unverified give the same body', async () => {
    state.users = [
      makeUser({ email: 'verified@example.com' }),
      makeUser({ email: 'pending@example.com', isEmailVerified: false }),
    ];
    const authService = require(PATHS.authService);
    const unknown = await authService.resendVerificationEmail('ghost@example.com');
    const verified = await authService.resendVerificationEmail('verified@example.com');
    const pending = await authService.resendVerificationEmail('pending@example.com');
    assert.deepStrictEqual(verified, unknown);
    assert.deepStrictEqual(pending, unknown);
    assert.deepStrictEqual(Object.keys(unknown), ['message']);
  });
});

describe('login controller records failed attempts for existing users', () => {
  let recorded;

  beforeEach(() => {
    clearMocks();
    recorded = [];
    const err = new Error('Email hoặc mật khẩu không đúng');
    err.statusCode = 401;
    err.errorCode = 'AUTH_INVALID_CREDENTIALS';
    Object.defineProperty(err, 'attemptedUserId', { value: 'u-real', enumerable: false });
    setMock(PATHS.authService, {
      login: async () => {
        throw err;
      },
    });
    setMock(PATHS.adminUserService, {
      recordLoginEvent: async (evt) => {
        recorded.push(evt);
      },
    });
    setMock(PATHS.email, { isAvailable: () => false });
    setMock(PATHS.shared, { resolveFrontendUrl: () => 'https://voicehub.local' });
    setMock(PATHS.sharedEmailPii, { readEmailFromStored: (v) => v });
  });

  afterEach(() => clearMocks());

  it('writes success:false event with the attempted user id and hides it from the body', async () => {
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.login(
      { body: { email: 'real@example.com', password: 'Wrong1!xx' }, headers: { 'user-agent': 'UA' }, ip: '203.0.113.9' },
      res
    );
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(JSON.stringify(res.body).includes('u-real'), false);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].userId, 'u-real');
    assert.equal(recorded[0].success, false);
    assert.equal(recorded[0].errorCode, 'AUTH_INVALID_CREDENTIALS');
  });
});
