const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SERVICE_ENV_KEYS = [
  'AUTH_SERVICE_URL',
  'USER_SERVICE_URL',
  'FRIEND_SERVICE_URL',
  'ORGANIZATION_SERVICE_URL',
  'ROLE_PERMISSION_SERVICE_URL',
  'CHAT_SERVICE_URL',
  'VOICE_SERVICE_URL',
  'PROJECT_SERVICE_URL',
  'DOCUMENT_SERVICE_URL',
  'NOTIFICATION_SERVICE_URL',
  'SOCKET_SERVICE_URL',
];

for (const key of SERVICE_ENV_KEYS) {
  if (!process.env[key]) process.env[key] = 'http://127.0.0.1:9';
}
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'unit-test-jwt-secret';

const {
  isUserBlockedInternalPath,
  isAuthInternalS2SPath,
  stripClientSuppliedInternalHeaders,
} = require('../src/config/services');
const authMiddleware = require('../src/middlewares/auth.middleware');
const {
  stripSpoofedForwardHeaders,
  applyTrustedIdentityHeaders,
} = require('../src/middlewares/forwardHeaders');

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('isUserBlockedInternalPath', () => {
  const blocked = [
    '/api/users/internal/profile/x',
    '/api/tasks/internal/purge-organization/x',
    '/api/projects/internal/audit-events',
    '/api/meetings/internal/x',
    '/api/messages/internal/dm/delete-between',
    '/api/notifications/internal/read-voice-room-join-request',
    '/users/internal/profile/x',
    '/api/users/Internal/profile/x',
    '/api/users/internal/profile/x?include=email',
  ];

  for (const path of blocked) {
    it(`blocks ${path}`, () => {
      assert.equal(isUserBlockedInternalPath(path), true);
    });
  }

  const allowed = [
    '/api/auth/internal/provision',
    '/api/organizations/internal/membership/o/u',
    '/api/friends/internal/ensure-accepted',
    '/auth/internal/provision',
    '/api/users/me',
    '/api/tasks/task-1',
    '/api/projects/p1',
    '/api/meetings/m1',
    '/api/healthcare',
  ];

  for (const path of allowed) {
    it(`allows ${path}`, () => {
      assert.equal(isUserBlockedInternalPath(path), false);
    });
  }

  it('keeps the three S2S prefixes on the internal-token allowlist', () => {
    assert.equal(isAuthInternalS2SPath('/api/auth/internal/provision'), true);
    assert.equal(isAuthInternalS2SPath('/api/organizations/internal/org/x/summary'), true);
    assert.equal(isAuthInternalS2SPath('/api/friends/internal/ensure-accepted'), true);
    assert.equal(isAuthInternalS2SPath('/api/users/internal/profile/x'), false);
  });
});

describe('stripClientSuppliedInternalHeaders', () => {
  it('drops client internal tokens and leaves gateway identity headers', () => {
    const headers = {
      authorization: 'Bearer user',
      'x-user-id': 'should-stay-until-proxy-overwrite',
      'x-internal-token': 'leaked',
      'x-chat-internal-token': 'leaked',
      'x-internal-notification-token': 'leaked',
      'x-realtime-token': 'leaked',
      'x-vh-org-documents-internal': '1',
      'x-gateway-internal-token': 'set-by-proxy-later',
    };
    stripClientSuppliedInternalHeaders(headers);
    assert.equal(headers.authorization, 'Bearer user');
    assert.equal(headers['x-user-id'], 'should-stay-until-proxy-overwrite');
    assert.equal(headers['x-gateway-internal-token'], 'set-by-proxy-later');
    assert.equal(headers['x-internal-token'], undefined);
    assert.equal(headers['x-chat-internal-token'], undefined);
    assert.equal(headers['x-internal-notification-token'], undefined);
    assert.equal(headers['x-realtime-token'], undefined);
    assert.equal(headers['x-vh-org-documents-internal'], undefined);
  });
});

function withEnv(key, value, fn) {
  const saved = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

describe('applyTrustedIdentityHeaders (Sec-Y2)', () => {
  it('drops client x-user-system-role when JWT has no system role', () => {
    const req = {
      user: { id: 'u1', email: 'u1@example.com' },
      headers: {
        'x-user-id': 'forged',
        'x-user-email': 'forged@example.com',
        'x-user-system-role': 'admin',
        'x-gateway-internal-token': 'forged',
        'x-internal-token': 'forged',
      },
    };
    withEnv('GATEWAY_INTERNAL_TOKEN', 'gw-token', () => applyTrustedIdentityHeaders(req));
    assert.equal(req.headers['x-user-system-role'], undefined);
    assert.equal(req.headers['x-user-id'], 'u1');
    assert.equal(req.headers['x-user-email'], 'u1@example.com');
    assert.equal(req.headers['x-gateway-internal-token'], 'gw-token');
    assert.equal(req.headers['x-internal-token'], undefined);
  });

  it('re-injects x-user-system-role only from the verified JWT', () => {
    const req = {
      user: { id: 'u2', systemRole: 'user' },
      headers: { 'x-user-system-role': 'admin' },
    };
    withEnv('GATEWAY_INTERNAL_TOKEN', 'gw-token', () => applyTrustedIdentityHeaders(req));
    assert.equal(req.headers['x-user-system-role'], 'user');
  });

  it('leaves no identity headers for anonymous requests', () => {
    const req = {
      headers: {
        'x-user-id': 'forged',
        'x-user-system-role': 'admin',
        'x-organization-id': 'org-x',
      },
    };
    withEnv('GATEWAY_INTERNAL_TOKEN', 'gw-token', () => applyTrustedIdentityHeaders(req));
    assert.equal(req.headers['x-user-id'], undefined);
    assert.equal(req.headers['x-user-system-role'], undefined);
    assert.equal(req.headers['x-organization-id'], undefined);
  });
});

describe('stripSpoofedForwardHeaders (Sec-Y2)', () => {
  function run(trustProxy) {
    const req = {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '1.2.3.4',
        authorization: 'Bearer user',
      },
    };
    let nextCalled = false;
    withEnv('TRUST_PROXY', trustProxy, () =>
      stripSpoofedForwardHeaders(req, {}, () => {
        nextCalled = true;
      })
    );
    return { req, nextCalled };
  }

  it('strips client XFF / X-Real-IP when TRUST_PROXY is off (direct :3000)', () => {
    const { req, nextCalled } = run(undefined);
    assert.equal(nextCalled, true);
    assert.equal(req.headers['x-forwarded-for'], undefined);
    assert.equal(req.headers['x-real-ip'], undefined);
    assert.equal(req.headers.authorization, 'Bearer user');
  });

  it('keeps XFF when TRUST_PROXY=1 (Nginx owns forwarded headers)', () => {
    const { req, nextCalled } = run('1');
    assert.equal(nextCalled, true);
    assert.equal(req.headers['x-forwarded-for'], '1.2.3.4');
    assert.equal(req.headers['x-real-ip'], '1.2.3.4');
  });

  it('spoofed XFF does not change req.ip when TRUST_PROXY is off', async () => {
    const express = require('express');
    const http = require('node:http');
    const app = express();
    app.use(stripSpoofedForwardHeaders);
    app.get('/ip', (req, res) => res.json({ ip: req.ip, xff: req.headers['x-forwarded-for'] || null }));
    const server = http.createServer(app);
    const savedTrustProxy = process.env.TRUST_PROXY;
    delete process.env.TRUST_PROXY;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/ip`, {
        headers: { 'x-forwarded-for': '6.6.6.6' },
      });
      const body = await res.json();
      assert.notEqual(body.ip, '6.6.6.6');
      assert.equal(body.xff, null);
    } finally {
      if (savedTrustProxy !== undefined) process.env.TRUST_PROXY = savedTrustProxy;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('auth middleware internal deny', () => {
  it('returns 403 for a user JWT path under /internal before token checks', async () => {
    const req = {
      method: 'GET',
      path: '/api/users/internal/profile/user-1',
      originalUrl: '/api/users/internal/profile/user-1',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    };
    const res = mockRes();
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    await Promise.resolve();
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'ROUTE_NOT_PERMITTED');
    assert.equal(JSON.stringify(res.body).includes('/internal'), false);
  });

  it('still requires an internal token for S2S allowlist paths', async () => {
    const req = {
      method: 'POST',
      path: '/api/auth/internal/provision',
      originalUrl: '/api/auth/internal/provision',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    };
    const res = mockRes();
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    await Promise.resolve();
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.errorCode, 'GATEWAY_TRUST_INVALID');
  });

  it('does not block ordinary user routes', async () => {
    const req = {
      method: 'GET',
      path: '/api/users/me',
      originalUrl: '/api/users/me',
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    authMiddleware(req, res, () => {
      nextCalled = true;
    });
    await Promise.resolve();
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.errorCode, 'AUTH_NO_TOKEN');
  });
});
