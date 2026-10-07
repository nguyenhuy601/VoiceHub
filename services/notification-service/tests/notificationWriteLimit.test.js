const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertNotificationWriteAllowed,
  createNotificationRateLimitError,
  NOTIFICATION_RATE_LIMITED,
} = require('../src/utils/notificationWriteLimit');
const { toNotificationError } = require('../src/utils/notificationErrorMap');
const { sendErrorFromCatch } = require('../src/middlewares/sendServiceError');

function allowCheck() {
  return async () => ({ allowed: true, remaining: 10 });
}

function denyAfter(max) {
  let n = 0;
  return async () => {
    n += 1;
    return { allowed: n <= max, remaining: Math.max(0, max - n) };
  };
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
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

function sliceMethod(src, name) {
  const start = src.indexOf(`async ${name}(`);
  assert.ok(start >= 0, name);
  const next = src.indexOf('\n  async ', start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('assertNotificationWriteAllowed', () => {
  it('item over limit throws NOTIFICATION_RATE_LIMITED and does not call the reader', async () => {
    let reads = 0;
    const check = denyAfter(0);
    await assert.rejects(
      async () => {
        await assertNotificationWriteAllowed({ userId: 'u1', bucket: 'item', checkRateLimit: check });
        reads += 1;
      },
      (err) => err.errorCode === NOTIFICATION_RATE_LIMITED && err.statusCode === 429 && err.bucket === 'item'
    );
    assert.equal(reads, 0);
  });

  it('bulk bucket is independent from item', async () => {
    await assert.rejects(
      () =>
        assertNotificationWriteAllowed({
          userId: 'u1',
          bucket: 'item',
          checkRateLimit: denyAfter(0),
        }),
      (err) => err.errorCode === NOTIFICATION_RATE_LIMITED
    );
    await assertNotificationWriteAllowed({
      userId: 'u1',
      bucket: 'bulk',
      checkRateLimit: allowCheck(),
    });
  });

  it('toNotificationError and sendErrorFromCatch keep 429 NOTIFICATION_RATE_LIMITED', () => {
    const err = createNotificationRateLimitError();
    const mapped = toNotificationError(err);
    assert.equal(mapped, err);
    assert.equal(mapped.statusCode, 429);
    assert.equal(mapped.errorCode, NOTIFICATION_RATE_LIMITED);
    const res = mockRes();
    sendErrorFromCatch(res, err, 500, 'fallback', 'NOTIFICATION_INTERNAL_ERROR');
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.errorCode, NOTIFICATION_RATE_LIMITED);
    assert.match(String(res.body.messageUser || ''), /Quá nhiều/);
  });

  it('no redis / limiter allows: does not invent 429 (D4)', async () => {
    await assertNotificationWriteAllowed({
      userId: 'u1',
      bucket: 'item',
      checkRateLimit: async () => ({ allowed: true, remaining: 10 }),
    });
    await assertNotificationWriteAllowed({
      userId: 'u1',
      bucket: 'bulk',
      checkRateLimit: async () => ({ allowed: true }),
    });
  });
});

describe('notification controller source contract', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/controllers/notification.controller.js'),
    'utf8'
  );

  it('markAsRead and deleteNotification assert item before the service write', () => {
    for (const [name, call] of [
      ['markAsRead', 'notificationService.markAsRead'],
      ['deleteNotification', 'notificationService.deleteNotification'],
    ]) {
      const body = sliceMethod(src, name);
      const gate = body.indexOf("bucket: 'item'");
      const write = body.indexOf(call);
      assert.ok(gate >= 0 && write > gate, name);
    }
  });

  it('markAllAsRead asserts bulk before scope lookup and the service write', () => {
    const body = sliceMethod(src, 'markAllAsRead');
    const gate = body.indexOf("bucket: 'bulk'");
    const scope = body.indexOf('resolveScopedAccess');
    const write = body.indexOf('notificationService.markAllAsRead');
    assert.ok(gate >= 0 && scope > gate && write > gate);
    assert.equal(body.split("bucket: 'bulk'").length - 1, 1);
  });

  it('deleteAllRead asserts bulk once before scope lookup', () => {
    const body = sliceMethod(src, 'deleteAllRead');
    const gate = body.indexOf("bucket: 'bulk'");
    const scope = body.indexOf('resolveScopedAccess');
    assert.ok(gate >= 0 && scope > gate);
    assert.equal(body.split("bucket: 'bulk'").length - 1, 1);
  });

  it('list and internal voice-read handlers do not rate-limit', () => {
    for (const name of ['getUserNotifications', 'markVoiceRoomJoinRequestReadInternal']) {
      const body = sliceMethod(src, name);
      assert.equal(body.includes('bucket:'), false, name);
    }
  });
});
