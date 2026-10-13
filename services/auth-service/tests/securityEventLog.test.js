const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const utilPath = path.resolve(__dirname, '../src/utils/securityEventLog.js');
const servicePath = path.resolve(__dirname, '../src/services/adminUser.service.js');
const loginEventPath = path.resolve(__dirname, '../src/models/AuthLoginEvent.js');
const requireClientHeaderPath = path.resolve(
  __dirname,
  '../src/middleware/requireClientHeader.js'
);
const sendServiceErrorPath = path.resolve(__dirname, '../src/middleware/sendServiceError.js');

function clearModules() {
  for (const p of [utilPath, servicePath, loginEventPath, requireClientHeaderPath]) {
    delete require.cache[p];
  }
}

describe('securityEventLog', () => {
  let logs;

  beforeEach(() => {
    clearModules();
    logs = [];
    mock.method(console, 'log', (...args) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    mock.restoreAll();
    clearModules();
  });

  it('logSecurityEvent writes JSON without password/token/email plaintext', () => {
    const {
      logSecurityEvent,
      hashEmailForLoginEvent,
      assertSecurityPayloadSafe,
    } = require(utilPath);

    const email = 'attacker@evil.example';
    const password = 'SuperSecretPass1!';
    const token = 'eyJhbGciOiJIUzI1NiJ9.fake.token';
    const emailHash = hashEmailForLoginEvent(email);

    logSecurityEvent({
      type: 'login_failed',
      emailHash,
      ip: '203.0.113.10',
      errorCode: 'AUTH_INVALID_CREDENTIALS',
    });

    assert.equal(logs.length, 1);
    const payload = JSON.parse(logs[0]);
    assert.equal(payload.security_event, true);
    assert.equal(payload.type, 'login_failed');
    assert.equal(payload.emailHash, emailHash);
    assert.equal(payload.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assertSecurityPayloadSafe(payload, { password, token, email });
    assert.ok(!JSON.stringify(payload).includes(email));
    assert.ok(!JSON.stringify(payload).includes(password));
  });

  it('hashEmailForLoginEvent is stable and case-insensitive', () => {
    const { hashEmailForLoginEvent } = require(utilPath);
    const a = hashEmailForLoginEvent('User@Example.COM');
    const b = hashEmailForLoginEvent('user@example.com');
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.equal(hashEmailForLoginEvent(''), null);
  });

  it('recordLoginEvent persists unknown-email fail with emailHash only', async () => {
    let created = null;
    require.cache[loginEventPath] = {
      exports: {
        create: async (doc) => {
          created = doc;
          return { ...doc, _id: 'evt-unknown' };
        },
      },
    };

    // Minimal stubs so adminUser.service loads
    const userAuthPath = path.resolve(__dirname, '../src/models/UserAuth.js');
    require.cache[userAuthPath] = { exports: {} };
    require.cache[path.resolve(__dirname, '../src/utils/email.js')] = {
      exports: { isAvailable: () => false },
    };
    require.cache[path.resolve(__dirname, '../src/utils/password.js')] = {
      exports: {
        hashPassword: async () => 'x',
        validatePasswordStrength: () => ({ isValid: true, errors: [] }),
        generateTemporaryPassword: () => 'Temp1!',
      },
    };
    require.cache[path.resolve(__dirname, '../src/utils/tokenVersion.js')] = {
      exports: { bumpTokenVersion: async () => 1 },
    };
    require.cache[path.resolve(__dirname, '../src/utils/authEmailPii.js')] = {
      exports: {
        hydrateAuthEmailDoc: async () => null,
        readEmailFromStored: () => '',
        findUserAuthByEmail: async () => null,
      },
    };
    require.cache[path.resolve(__dirname, '../src/utils/oneTimeToken.js')] = {
      exports: { hashOneTimeToken: () => 'h' },
    };

    delete require.cache[servicePath];
    const { recordLoginEvent } = require(servicePath);
    const { hashEmailForLoginEvent } = require(utilPath);
    const email = 'nobody@example.com';
    const emailHash = hashEmailForLoginEvent(email);

    await recordLoginEvent({
      userId: null,
      emailHash,
      success: false,
      ip: '198.51.100.1',
      userAgent: 'jest',
      errorCode: 'AUTH_INVALID_CREDENTIALS',
    });

    assert.ok(created);
    assert.equal(created.emailHash, emailHash);
    assert.equal(created.success, false);
    assert.equal(created.errorCode, 'AUTH_INVALID_CREDENTIALS');
    assert.ok(!Object.prototype.hasOwnProperty.call(created, 'userId') || !created.userId);
    assert.ok(!JSON.stringify(created).includes(email));
  });

  it('requireClientHeader logs csrf_header_invalid without secrets', () => {
    require.cache[sendServiceErrorPath] = {
      exports: {
        sendServiceError: (res, status, body) => {
          res.statusCode = status;
          res.body = body;
          return res;
        },
      },
    };
    delete require.cache[requireClientHeaderPath];
    const requireClientHeader = require(requireClientHeaderPath);
    const mw = requireClientHeader();
    const req = { ip: '203.0.113.50', headers: {} };
    const res = {};
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'AUTH_CSRF_INVALID');
    assert.equal(logs.length, 1);
    const payload = JSON.parse(logs[0]);
    assert.equal(payload.type, 'csrf_header_invalid');
    assert.equal(payload.errorCode, 'AUTH_CSRF_INVALID');
    assert.ok(!JSON.stringify(payload).includes('password'));
    assert.ok(!JSON.stringify(payload).includes('token'));
  });
});
