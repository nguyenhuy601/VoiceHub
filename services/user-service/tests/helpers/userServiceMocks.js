const path = require('node:path');

const src = (rel) => path.resolve(__dirname, '../../src', rel);

const PATHS = {
  controller: src('controllers/user.controller.js'),
  userService: src('services/user.service.js'),
  userProfile: src('models/UserProfile.js'),
  objectStorage: src('utils/objectStorage.js'),
  authSummaryClient: src('clients/authSummary.client.js'),
  orgMembershipClient: src('clients/orgMembership.client.js'),
  companyAdminAuth: src('middlewares/companyAdminAuth.js'),
  shared: require.resolve('@enterprise/shared'),
};

function setMock(filePath, exports) {
  require.cache[filePath] = { id: filePath, filename: filePath, loaded: true, exports };
}

function clearMocks() {
  for (const p of Object.values(PATHS)) delete require.cache[p];
}

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Shared tối thiểu: không Redis, log im lặng. */
function installSharedMock(overrides = {}) {
  setMock(PATHS.shared, {
    logger: silentLogger,
    getRedisClient: () => null,
    getCryptoMetrics: () => ({}),
    ...overrides,
  });
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    headersSent: false,
    sentFile: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    sendFile(filePath) {
      this.sentFile = filePath;
      this.headersSent = true;
      return this;
    },
  };
}

module.exports = { PATHS, setMock, clearMocks, installSharedMock, mockRes, silentLogger };
