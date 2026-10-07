const path = require('node:path');

const src = (rel) => path.resolve(__dirname, '../../src', rel);

const PATHS = {
  authService: src('services/auth.service.js'),
  adminUserService: src('services/adminUser.service.js'),
  controller: src('controllers/auth.controller.js'),
  userAuth: src('models/UserAuth.js'),
  password: src('utils/password.js'),
  tokenVersion: src('utils/tokenVersion.js'),
  email: src('utils/email.js'),
  bootstrap: src('utils/bootstrapUserProfile.js'),
  authEmailPii: src('utils/authEmailPii.js'),
  jwt: src('config/jwt.js'),
  shared: require.resolve('@enterprise/shared'),
  sharedMongo: require.resolve('@enterprise/shared/config/mongo'),
  sharedTokenVersion: require.resolve('@enterprise/shared/utils/tokenVersionAuth'),
  sharedDob: require.resolve('@enterprise/shared/utils/dateOfBirthPii'),
  sharedEmailPii: require.resolve('@enterprise/shared/utils/emailPii'),
};

function setMock(filePath, exports) {
  require.cache[filePath] = { id: filePath, filename: filePath, loaded: true, exports };
}

function clearMocks() {
  for (const p of Object.values(PATHS)) delete require.cache[p];
}

/**
 * Cài mock tối thiểu cho auth.service (không Mongo/Redis/SMTP thật).
 * state.users: danh sách doc; state.compareCalls đếm lượt bcrypt compare.
 */
function installAuthServiceMocks(state) {
  clearMocks();
  state.compareCalls = 0;
  state.findOneQueries = [];

  setMock(PATHS.userAuth, {
    findOne: async (query) => {
      state.findOneQueries.push(query);
      return state.findOneResult ?? null;
    },
  });
  setMock(PATHS.password, {
    hashPassword: async (pwd) => `hashed:${pwd}`,
    comparePassword: async (pwd, hash) => {
      state.compareCalls += 1;
      return typeof pwd === 'string' && hash === `hashed:${pwd}`;
    },
    validatePasswordStrength: () => ({ isValid: true, errors: [] }),
    generateTemporaryPassword: () => 'TempPass1!',
  });
  setMock(PATHS.tokenVersion, {
    bumpTokenVersion: async () => 1,
    accessTokenPayload: () => ({ tv: 1 }),
  });
  setMock(PATHS.email, {
    isAvailable: () => Boolean(state.emailAvailable),
    sendPasswordResetEmail: async (...args) => {
      state.sentReset = args;
      return true;
    },
    sendVerificationEmail: async (...args) => {
      state.sentVerify = args;
      return true;
    },
  });
  setMock(PATHS.bootstrap, { bootstrapUserProfile: async () => ({ ok: true }) });
  setMock(PATHS.authEmailPii, {
    findUserAuthByEmail: async (email) =>
      (state.users || []).find((u) => u.email === String(email).trim().toLowerCase()) || null,
    hydrateAuthEmailDoc: async (doc) => doc.email || null,
    writeEmailFields: (email) => ({ email }),
    normalizeEmail: (email) => String(email || '').trim().toLowerCase(),
  });
  setMock(PATHS.jwt, {
    generateAccessToken: () => 'access',
    generateOpaqueRefreshToken: () => 'refresh',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
  });
  setMock(PATHS.shared, { getRedisClient: () => null, resolveFrontendUrl: () => 'https://voicehub.local' });
  setMock(PATHS.sharedMongo, {
    mongoose: { connection: { readyState: 1 }, Types: { ObjectId: class ObjectId {} } },
  });
  setMock(PATHS.sharedTokenVersion, { cacheTokenVersion: async () => {} });
  setMock(PATHS.sharedDob, { writeDateOfBirthFields: () => ({}) });
}

function makeUser(overrides = {}) {
  return {
    userId: 'u1',
    email: 'real@example.com',
    password: 'hashed:Correct1!',
    isEmailVerified: true,
    isActive: true,
    isLocked: false,
    incCalls: 0,
    async incLoginAttempts() {
      this.incCalls += 1;
    },
    async resetLoginAttempts() {},
    async save() {},
    ...overrides,
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

module.exports = { PATHS, setMock, clearMocks, installAuthServiceMocks, makeUser, mockRes };
