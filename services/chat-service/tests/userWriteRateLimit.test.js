const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createUserWriteRateLimiter } = require('../src/middleware/userWriteRateLimit');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
}

async function hit(limiter, userId) {
  const res = mockRes();
  let passed = false;
  await limiter({ user: { id: userId } }, res, () => {
    passed = true;
  });
  return { passed, res };
}

function fakeRedis() {
  const store = new Map();
  return {
    store,
    async incr(key) {
      const v = (store.get(key) || 0) + 1;
      store.set(key, v);
      return v;
    },
    async pexpire() {
      return 1;
    },
  };
}

describe('createUserWriteRateLimiter', () => {
  it('dưới ngưỡng thì next(), vượt ngưỡng → 429 + Retry-After', async () => {
    const redis = fakeRedis();
    const limiter = createUserWriteRateLimiter({
      bucket: 'message',
      max: 2,
      windowMs: 60000,
      getRedis: () => redis,
      now: () => 30000,
    });
    assert.equal((await hit(limiter, 'u1')).passed, true);
    assert.equal((await hit(limiter, 'u1')).passed, true);
    const blocked = await hit(limiter, 'u1');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.body.errorCode, 'CHAT_RATE_LIMITED');
    assert.equal(blocked.res.body.success, false);
    assert.equal(blocked.res.headers['Retry-After'], '30');
  });

  it('sang cửa sổ mới thì reset', async () => {
    const redis = fakeRedis();
    let ts = 1000;
    const limiter = createUserWriteRateLimiter({
      bucket: 'message',
      max: 1,
      windowMs: 60000,
      getRedis: () => redis,
      now: () => ts,
    });
    assert.equal((await hit(limiter, 'u1')).passed, true);
    assert.equal((await hit(limiter, 'u1')).passed, false);
    ts = 61000;
    assert.equal((await hit(limiter, 'u1')).passed, true);
  });

  it('Redis incr lỗi → fallback memory vẫn chặn', async () => {
    const limiter = createUserWriteRateLimiter({
      bucket: 'message',
      max: 1,
      windowMs: 60000,
      getRedis: () => ({
        incr: async () => {
          throw new Error('redis down');
        },
        pexpire: async () => 1,
      }),
      now: () => 5000,
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      assert.equal((await hit(limiter, 'u1')).passed, true);
      assert.equal((await hit(limiter, 'u1')).res.statusCode, 429);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('không có Redis → đếm memory', async () => {
    const limiter = createUserWriteRateLimiter({
      bucket: 'message',
      max: 1,
      getRedis: () => null,
      now: () => 5000,
    });
    assert.equal((await hit(limiter, 'u1')).passed, true);
    assert.equal((await hit(limiter, 'u1')).passed, false);
  });

  it('user và bucket tách biệt', async () => {
    const redis = fakeRedis();
    const opts = { max: 1, windowMs: 60000, getRedis: () => redis, now: () => 5000 };
    const message = createUserWriteRateLimiter({ ...opts, bucket: 'message' });
    const reaction = createUserWriteRateLimiter({ ...opts, bucket: 'reaction' });
    assert.equal((await hit(message, 'u1')).passed, true);
    assert.equal((await hit(message, 'u2')).passed, true);
    assert.equal((await hit(reaction, 'u1')).passed, true);
    assert.equal((await hit(message, 'u1')).passed, false);
  });

  it('không có userId → bỏ qua (route đã qua authenticate)', async () => {
    const limiter = createUserWriteRateLimiter({ bucket: 'message', max: 0, getRedis: () => null });
    const res = mockRes();
    let passed = false;
    await limiter({}, res, () => {
      passed = true;
    });
    assert.equal(passed, true);
  });
});

describe('route wiring (source contract)', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/message.routes.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

  it('route /internal/* khai báo trước authenticate và không có limiter', () => {
    const authAt = routes.indexOf('router.use(authenticate)');
    assert.ok(authAt > 0);
    const internalBlock = routes.slice(0, authAt);
    assert.match(internalBlock, /\/internal\//);
    assert.doesNotMatch(internalBlock, /internalServiceOnly,\s*\w+WriteLimiter/);
    assert.doesNotMatch(internalBlock, /WriteLimiter,\s*messageController/);
  });

  it('route ghi có limiter', () => {
    const after = routes.slice(routes.indexOf('router.use(authenticate)'));
    for (const pattern of [
      /'\/storage\/signed-upload',\s*messageWriteLimiter/,
      /router\.post\('\/', messageWriteLimiter/,
      /'\/:messageId',\s*messageWriteLimiter,\s*messageController\.deleteMessage/,
      /'\/:messageId\/recall',\s*messageWriteLimiter/,
      /'\/:messageId\/edit',\s*messageWriteLimiter/,
      /'\/:messageId\/reactions',\s*reactionWriteLimiter/,
      /'\/:messageId\/reactions\/:emoji',\s*reactionWriteLimiter/,
      /'\/:messageId\/votes',\s*voteWriteLimiter/,
    ]) {
      assert.match(after, pattern);
    }
  });

  it('upload nhị phân: limiter sau authenticate, trước rawUploadParser', () => {
    assert.match(app, /authenticate,\s*messageWriteLimiter,\s*rawUploadParser/);
  });
});
