const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const servicePath = path.resolve(__dirname, '../src/services/auth.service.js');
const emailServicePath = path.resolve(__dirname, '../src/utils/email.js');
const userAuthPath = path.resolve(__dirname, '../src/models/UserAuth.js');
const authEmailPiiPath = path.resolve(__dirname, '../src/utils/authEmailPii.js');
const passwordPath = path.resolve(__dirname, '../src/utils/password.js');
const dateOfBirthPath = path.resolve(__dirname, '../src/utils/dateOfBirth.js');
const bootstrapPath = path.resolve(__dirname, '../src/utils/bootstrapUserProfile.js');
const jwtConfigPath = path.resolve(__dirname, '../src/config/jwt.js');
const tokenVersionPath = path.resolve(__dirname, '../src/utils/tokenVersion.js');
const refreshHashPath = path.resolve(__dirname, '../src/utils/refreshTokenHash.js');
const jwtDurationPath = path.resolve(__dirname, '../src/utils/jwtDuration.js');

const ALL_PATHS = [
  servicePath,
  emailServicePath,
  userAuthPath,
  authEmailPiiPath,
  passwordPath,
  dateOfBirthPath,
  bootstrapPath,
  jwtConfigPath,
  tokenVersionPath,
  refreshHashPath,
  jwtDurationPath,
];

function clearServiceModules() {
  for (const p of ALL_PATHS) {
    delete require.cache[p];
  }
}

function installBaseMocks({ findUserAuthByEmail, sendVerificationEmail }) {
  require.cache[emailServicePath] = {
    exports: {
      isAvailable: () => true,
      sendVerificationEmail,
    },
  };

  require.cache[userAuthPath] = {
    exports: function UserAuth(doc) {
      Object.assign(this, doc);
      this.save = async () => this;
    },
  };

  require.cache[authEmailPiiPath] = {
    exports: {
      normalizeEmail: (email) => String(email || '').trim().toLowerCase(),
      writeEmailFields: (email) => ({ email }),
      findUserAuthByEmail,
      hydrateAuthEmailDoc: async (doc) => doc.email || null,
    },
  };

  require.cache[passwordPath] = {
    exports: {
      hashPassword: async (p) => `hashed:${p}`,
      comparePassword: async () => true,
      validatePasswordStrength: () => ({ isValid: true, errors: [] }),
      generateTemporaryPassword: () => 'TempPass1!',
    },
  };

  require.cache[dateOfBirthPath] = {
    exports: {
      validateRegistrationDateOfBirth: () => ({
        ok: true,
        date: new Date('1990-01-01'),
      }),
    },
  };

  require.cache[bootstrapPath] = {
    exports: { bootstrapUserProfile: async () => ({}) },
  };

  require.cache[jwtConfigPath] = {
    exports: {
      generateAccessToken: () => 'access',
      generateOpaqueRefreshToken: () => 'refresh',
    },
  };

  require.cache[tokenVersionPath] = {
    exports: {
      bumpTokenVersion: async () => 1,
      accessTokenPayload: () => ({}),
    },
  };

  require.cache[refreshHashPath] = {
    exports: {
      hashRefreshToken: (t) => `hash:${t}`,
      refreshTokenMatches: () => true,
    },
  };

  require.cache[jwtDurationPath] = {
    exports: {
      refreshTokenExpiresAtFromNow: () => new Date(Date.now() + 86400000),
      refreshTokenRedisTtlSeconds: () => 86400,
    },
  };
}

describe('auth.service verification email policy', () => {
  afterEach(() => {
    clearServiceModules();
  });

  it('T1 register does not call sendVerificationEmail (public register disabled)', async () => {
    let sendVerificationCalls = 0;
    clearServiceModules();
    installBaseMocks({
      findUserAuthByEmail: async () => null,
      sendVerificationEmail: async () => {
        sendVerificationCalls += 1;
        return { messageId: 'x' };
      },
    });

    const authService = require(servicePath);
    await assert.rejects(
      () =>
        authService.register(
          {
            email: 'user@example.com',
            password: 'StrongPass1!',
            firstName: 'A',
            lastName: 'B',
            dateOfBirth: '1990-01-01',
          },
          'https://voicehub.local'
        ),
      (err) => err && err.errorCode === 'AUTH_REGISTER_DISABLED'
    );
    assert.equal(sendVerificationCalls, 0);
  });

  it('T2 resendVerificationEmail calls sendVerificationEmail for unverified user', async () => {
    let sendVerificationCalls = 0;
    const savedUser = {
      email: 'user@example.com',
      isEmailVerified: false,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      save: async function save() {
        return this;
      },
    };

    clearServiceModules();
    installBaseMocks({
      findUserAuthByEmail: async () => savedUser,
      sendVerificationEmail: async () => {
        sendVerificationCalls += 1;
        return { messageId: 'test-msg-id' };
      },
    });

    const authService = require(servicePath);
    const result = await authService.resendVerificationEmail(
      'user@example.com',
      'https://voicehub.local'
    );

    assert.equal(sendVerificationCalls, 1);
    assert.equal(result.emailScheduled, true);
    assert.ok(savedUser.emailVerificationToken);
  });
});
