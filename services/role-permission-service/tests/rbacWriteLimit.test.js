const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertRbacWriteAllowed,
  ROLE_RATE_LIMITED,
  LIMIT_MESSAGE,
} = require('../src/utils/rbacWriteLimit');
const { sendServiceError } = require('../src/middleware/sendServiceError');

const ROLE_ROUTES = path.join(__dirname, '../src/routes/role.routes.js');
const PERMISSION_ROUTES = path.join(__dirname, '../src/routes/permission.routes.js');
const INTERNAL_ROUTES = path.join(__dirname, '../src/routes/internalRole.routes.js');

function routeWindow(src, marker) {
  const idx = src.indexOf(marker);
  assert.ok(idx >= 0, marker);
  const next = src.indexOf('router.', idx + marker.length);
  return src.slice(idx, next === -1 ? src.length : next);
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('assertRbacWriteAllowed', () => {
  it('rejects the 41st counted write and lets the 40th through', async () => {
    let n = 0;
    const check = async () => {
      n += 1;
      return { allowed: n <= 40, remaining: Math.max(0, 40 - n) };
    };
    for (let i = 0; i < 40; i += 1) {
      await assertRbacWriteAllowed({ userId: 'actor-1', checkRateLimit: check });
    }
    await assert.rejects(
      () => assertRbacWriteAllowed({ userId: 'actor-1', checkRateLimit: check }),
      (err) => err.statusCode === 429 && err.errorCode === ROLE_RATE_LIMITED && err.message === LIMIT_MESSAGE
    );
  });

  it('does not throw when Redis fails open or the count is allowed', async () => {
    await assertRbacWriteAllowed({
      userId: 'actor-1',
      checkRateLimit: async () => ({ allowed: true, remaining: 40, failOpen: true }),
    });
    await assertRbacWriteAllowed({
      userId: 'actor-1',
      checkRateLimit: async () => ({ allowed: true, remaining: 3 }),
    });
  });

  it('does not call checkRateLimit when the actor id is empty', async () => {
    let calls = 0;
    const check = async () => {
      calls += 1;
      return { allowed: false, remaining: 0 };
    };
    await assertRbacWriteAllowed({ userId: '', checkRateLimit: check });
    await assertRbacWriteAllowed({ userId: '   ', checkRateLimit: check });
    await assertRbacWriteAllowed({ req: { body: { userId: 'from-body' } }, checkRateLimit: check });
    assert.equal(calls, 0);
  });

  it('keys the bucket from the session user, not the body userId', async () => {
    let seen = '';
    await assertRbacWriteAllowed({
      req: { user: { id: 'actor-1' }, body: { userId: 'victim' } },
      checkRateLimit: async ({ key }) => {
        seen = key;
        return { allowed: true, remaining: 1 };
      },
    });
    assert.equal(seen, 'rbac:write:actor-1');
    const prevLimit = process.env.ROLE_WRITE_RATE_LIMIT;
    const prevWindow = process.env.ROLE_WRITE_WINDOW_SEC;
    delete process.env.ROLE_WRITE_RATE_LIMIT;
    delete process.env.ROLE_WRITE_WINDOW_SEC;
    try {
      await assertRbacWriteAllowed({
        req: { user: { userId: 'actor-2' } },
        checkRateLimit: async ({ key, limit, windowSec }) => {
          seen = `${key}|${limit}|${windowSec}`;
          return { allowed: true, remaining: 1 };
        },
      });
      assert.equal(seen, 'rbac:write:actor-2|40|600');
    } finally {
      if (prevLimit === undefined) delete process.env.ROLE_WRITE_RATE_LIMIT;
      else process.env.ROLE_WRITE_RATE_LIMIT = prevLimit;
      if (prevWindow === undefined) delete process.env.ROLE_WRITE_WINDOW_SEC;
      else process.env.ROLE_WRITE_WINDOW_SEC = prevWindow;
    }
  });
});

describe('rbac write route mount', () => {
  const roleSrc = fs.readFileSync(ROLE_ROUTES, 'utf8').replace(/\r\n/g, '\n');
  const permissionSrc = fs.readFileSync(PERMISSION_ROUTES, 'utf8').replace(/\r\n/g, '\n');
  const internalSrc = fs.readFileSync(INTERNAL_ROUTES, 'utf8').replace(/\r\n/g, '\n');

  it('mounts rbacWriteLimit after requireOrgRoleManager on the ten user writes', () => {
    for (const marker of [
      "router.post('/', requireOrgRoleManager, rbacWriteLimit,",
      "router.post('/assign', requireOrgRoleManager, rbacWriteLimit,",
      "router.post('/remove', requireOrgRoleManager, rbacWriteLimit,",
      "router.patch('/:roleId', requireOrgRoleManager, rbacWriteLimit,",
      "router.put('/:roleId', requireOrgRoleManager, rbacWriteLimit,",
      "router.delete('/:roleId', requireOrgRoleManager, rbacWriteLimit,",
    ]) {
      assert.ok(roleSrc.includes(marker), marker);
    }
    for (const marker of [
      "router.post(\n  '/groups/clone',",
      "router.patch(\n  '/groups/:groupId',",
      "router.put(\n  '/groups/:groupId/grants',",
      "router.put(\n  '/roles/:roleId/groups',",
      "router.post(\n  '/direct-replace',",
    ]) {
      const window = routeWindow(permissionSrc, marker);
      assert.match(window, /requireOrgRoleManager,\s*rbacWriteLimit,/);
    }
  });

  it('leaves reads, permission check, and internal routes without the write limiter', () => {
    for (const marker of [
      "router.get(\n  '/server/:serverId',",
      "router.get(\n  '/user/:userId/server/:serverId',",
      "router.get('/:roleId',",
    ]) {
      assert.equal(routeWindow(roleSrc, marker).includes('rbacWriteLimit'), false, marker);
    }
    for (const marker of [
      "router.post(\n  '/check',",
      "router.get(\n  '/groups',",
      "router.get(\n  '/roles/:roleId/groups',",
      "router.post(\n  '/internal/ensure-project-create-grant',",
    ]) {
      assert.equal(routeWindow(permissionSrc, marker).includes('rbacWriteLimit'), false, marker);
    }
    assert.equal(internalSrc.includes('rbacWriteLimit'), false);
  });
});

describe('ROLE_RATE_LIMITED response', () => {
  it('sendServiceError 429 keeps the Vietnamese sentence and omits mongo, stack, and password', () => {
    const res = mockRes();
    sendServiceError(res, 429, {
      errorCode: ROLE_RATE_LIMITED,
      messageUser: LIMIT_MESSAGE,
      message: LIMIT_MESSAGE,
    });
    const blob = JSON.stringify(res.body);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.errorCode, ROLE_RATE_LIMITED);
    assert.equal(res.body.messageUser, LIMIT_MESSAGE);
    assert.equal(/Mongo|stack|password/i.test(blob), false);
  });
});
