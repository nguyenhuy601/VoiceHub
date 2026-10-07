const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  isObjectIdString,
  maskEmailForLog,
  maskIpForHr,
  truncateForStore,
  escapeHtml,
  resolveSafeFrontendUrl,
  readBooleanStrict,
} = require('../src/utils/authInputSafety');
const { PATHS, setMock, clearMocks, mockRes } = require('./helpers/authServiceMocks');

const ENV = {
  FRONTEND_URL: 'https://voicehub.local',
  AUTH_FRONTEND_URL_ALLOWLIST: 'https://voicehub.local,http://localhost:5173',
};

describe('authInputSafety helpers', () => {
  it('isObjectIdString only accepts 24-hex strings', () => {
    assert.equal(isObjectIdString('64b0000000000000000000aa'), true);
    assert.equal(isObjectIdString('xyz'), false);
    assert.equal(isObjectIdString({ $ne: null }), false);
  });

  it('maskEmailForLog keeps first char and domain', () => {
    assert.equal(maskEmailForLog('alice@example.com'), 'a***@example.com');
    assert.equal(maskEmailForLog(''), '');
    assert.equal(maskEmailForLog('nodomain'), '***');
  });

  it('maskIpForHr hides the host part of IPv4 / IPv6', () => {
    assert.equal(maskIpForHr('203.0.113.45'), '203.0.113.x');
    assert.equal(maskIpForHr('::ffff:203.0.113.45'), '203.0.113.x');
    assert.equal(maskIpForHr('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:8d3::');
    assert.equal(maskIpForHr(null), null);
  });

  it('truncateForStore trims and caps length', () => {
    assert.equal(truncateForStore('a'.repeat(300), 256).length, 256);
    assert.equal(truncateForStore('  ', 10), null);
    assert.equal(truncateForStore(undefined, 10), null);
  });

  it('escapeHtml neutralises script injection', () => {
    const out = escapeHtml(`<script>alert("x")</script>&'`);
    assert.equal(out, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;');
    assert.equal(out.includes('<'), false);
  });

  it('resolveSafeFrontendUrl only allows listed origins', () => {
    assert.equal(resolveSafeFrontendUrl('https://voicehub.local/some/path', ENV), 'https://voicehub.local');
    assert.equal(resolveSafeFrontendUrl('http://localhost:5173', ENV), 'http://localhost:5173');
    assert.equal(resolveSafeFrontendUrl('https://evil.example', ENV), 'https://voicehub.local');
    assert.equal(resolveSafeFrontendUrl('javascript:alert(1)', ENV), 'https://voicehub.local');
    assert.equal(resolveSafeFrontendUrl('', ENV), 'https://voicehub.local');
  });

  it('readBooleanStrict accepts only real booleans or "true"/"false"', () => {
    assert.equal(readBooleanStrict(true), true);
    assert.equal(readBooleanStrict('false'), false);
    assert.equal(readBooleanStrict('yes'), null);
    assert.equal(readBooleanStrict(undefined), null);
    assert.equal(readBooleanStrict(1), null);
  });
});

describe('email templates escape user-controlled values', () => {
  let sent;
  const savedEnv = {};

  beforeEach(() => {
    for (const key of ['EMAIL_USER', 'EMAIL_PASSWORD']) savedEnv[key] = process.env[key];
    process.env.EMAIL_USER = 'sender@example.com';
    process.env.EMAIL_PASSWORD = 'not-a-real-password';
    delete require.cache[PATHS.email];
    sent = [];
  });

  afterEach(() => {
    delete require.cache[PATHS.email];
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('company invite / HR set-password / voice invite HTML contain no raw <script>', async () => {
    const emailService = require(PATHS.email);
    emailService.transporter = { sendMail: async (opts) => (sent.push(opts), { messageId: 'm1' }), verify: async () => true };
    const evil = '<script>alert(1)</script>';
    await emailService.sendCompanyInviteEmail('to@example.com', {
      inviteUrl: 'https://voicehub.local/invite?a=1&b="2"',
      organizationName: evil,
      firstName: evil,
      lastName: 'X',
    });
    await emailService.sendHrProvisionSetPasswordEmail('to@example.com', {
      resetUrl: 'https://voicehub.local/reset-password#token=abc',
      organizationName: evil,
      firstName: evil,
    });
    await emailService.sendVoiceRoomInviteEmail('to@example.com', {
      inviteUrl: 'https://voicehub.local/room/1',
      roomId: evil,
      hostName: evil,
    });
    assert.equal(sent.length, 3);
    for (const mail of sent) {
      assert.equal(mail.html.includes('<script>'), false);
      assert.ok(mail.html.includes('&lt;script&gt;'));
    }
    assert.ok(sent[0].html.includes('href="https://voicehub.local/invite?a=1&amp;b=&quot;2&quot;"'));
  });
});

describe('admin controller input checks', () => {
  let serviceCalls;

  beforeEach(() => {
    clearMocks();
    serviceCalls = [];
    setMock(PATHS.adminUserService, {
      setUserLocked: async (...args) => (serviceCalls.push(['lock', ...args]), {}),
      getAuthSummaryBatch: async (ids) => (serviceCalls.push(['batch', ids.length]), []),
      triggerPasswordReset: async (...args) => (serviceCalls.push(['reset', ...args]), {}),
      getAuthSummary: async () => {
        const err = new Error('Cast to ObjectId failed');
        err.name = 'CastError';
        throw err;
      },
    });
  });

  afterEach(() => {
    clearMocks();
    delete require.cache[require.resolve('../src/controllers/adminUser.controller')];
  });

  function loadController() {
    delete require.cache[require.resolve('../src/controllers/adminUser.controller')];
    return require('../src/controllers/adminUser.controller');
  }

  it('lock rejects non-boolean locked with 400 AUTH_VALIDATION_ERROR', async () => {
    const { adminUserController } = loadController();
    const res = mockRes();
    await adminUserController.lockUser({ params: { userId: '64b0000000000000000000aa' }, body: { locked: 'yes' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'AUTH_VALIDATION_ERROR');
    assert.equal(serviceCalls.length, 0);
  });

  it('invalid :userId -> 400 AUTH_INVALID_ID', async () => {
    const { adminUserController } = loadController();
    const res = mockRes();
    await adminUserController.getSummary({ params: { userId: 'abc' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'AUTH_INVALID_ID');
  });

  it('users-auth-summary rejects more than 500 ids', async () => {
    const { internalAuthSummaryBatch } = loadController();
    const res = mockRes();
    await internalAuthSummaryBatch({ body: { userIds: new Array(501).fill('64b0000000000000000000aa') } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'AUTH_VALIDATION_ERROR');
  });

  it('reset-password replaces a foreign frontendUrl with FRONTEND_URL', async () => {
    const saved = { ...process.env };
    process.env.FRONTEND_URL = ENV.FRONTEND_URL;
    process.env.AUTH_FRONTEND_URL_ALLOWLIST = ENV.AUTH_FRONTEND_URL_ALLOWLIST;
    try {
      const { adminUserController } = loadController();
      const res = mockRes();
      await adminUserController.triggerPasswordReset(
        { params: { userId: '64b0000000000000000000aa' }, body: { frontendUrl: 'https://evil.example' }, headers: {} },
        res
      );
      assert.deepStrictEqual(serviceCalls[0], ['reset', '64b0000000000000000000aa', 'https://voicehub.local']);
    } finally {
      process.env.FRONTEND_URL = saved.FRONTEND_URL;
      process.env.AUTH_FRONTEND_URL_ALLOWLIST = saved.AUTH_FRONTEND_URL_ALLOWLIST;
      if (saved.FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
      if (saved.AUTH_FRONTEND_URL_ALLOWLIST === undefined) delete process.env.AUTH_FRONTEND_URL_ALLOWLIST;
    }
  });
});

describe('listLoginEvents response', () => {
  const servicePath = PATHS.adminUserService;
  const loginEventPath = require('node:path').resolve(__dirname, '../src/models/AuthLoginEvent.js');
  let findArgs;

  beforeEach(() => {
    clearMocks();
    findArgs = {};
    setMock(PATHS.userAuth, { findOne: async () => null });
    setMock(loginEventPath, {
      create: async (doc) => {
        findArgs.created = doc;
        return doc;
      },
      find: () => ({
        sort: () => ({
          skip: (n) => {
            findArgs.skip = n;
            return {
              limit: (l) => {
                findArgs.limit = l;
                return {
                  lean: async () => [
                    { _id: 'e1', success: false, ip: '203.0.113.45', userAgent: 'UA', errorCode: 'AUTH_INVALID_CREDENTIALS', createdAt: new Date() },
                  ],
                };
              },
            };
          },
        }),
      }),
      countDocuments: async () => 1,
    });
    setMock(PATHS.email, { isAvailable: () => false });
    setMock(PATHS.password, { hashPassword: async () => 'h', validatePasswordStrength: () => ({ isValid: true, errors: [] }) });
    setMock(PATHS.tokenVersion, { bumpTokenVersion: async () => 1 });
    setMock(PATHS.authEmailPii, { hydrateAuthEmailDoc: async () => null, readEmailFromStored: () => null, findUserAuthByEmail: async () => null });
  });

  afterEach(() => {
    clearMocks();
    delete require.cache[loginEventPath];
  });

  it('hr sees masked IP, no userId field, and limit/page are clamped', async () => {
    const svc = require(servicePath);
    const hr = await svc.listLoginEvents('u1', { limit: 9999, page: 99999, level: 'hr' });
    assert.equal(hr.items[0].ip, '203.0.113.x');
    assert.equal('userId' in hr.items[0], false);
    assert.equal(hr.limit, 200);
    assert.equal(hr.page, 500);
    const full = await svc.listLoginEvents('u1', { level: 'full' });
    assert.equal(full.items[0].ip, '203.0.113.45');
  });

  it('recordLoginEvent truncates IP and user agent', async () => {
    const svc = require(servicePath);
    await svc.recordLoginEvent({ userId: 'u1', success: false, ip: '1'.repeat(100), userAgent: 'U'.repeat(400) });
    assert.equal(findArgs.created.ip.length, 64);
    assert.equal(findArgs.created.userAgent.length, 256);
  });
});
