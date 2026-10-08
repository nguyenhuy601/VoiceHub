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
