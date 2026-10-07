const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');
const {
  BULK_MAX_USER_IDS,
  MAX_PAGE,
  notFoundError,
  validationError,
  toNotificationError,
} = require('../src/utils/notificationErrorMap');
const { sendServiceError, sendErrorFromCatch } = require('../src/middlewares/sendServiceError');
const { errorHandler, notFoundHandler } = require('../src/middlewares/errorHandler');
const { toClientNotification } = require('../src/utils/notificationDto');
const {
  buildPerUserBulkEvents,
  runWithConcurrency,
} = require('../src/utils/notificationBulkEvents');

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

const mockReq = { method: 'POST', originalUrl: '/api/notifications/bulk' };

describe('toNotificationError', () => {
  it('keeps errors that already carry statusCode', () => {
    const err = notFoundError();
    assert.equal(toNotificationError(err), err);
    assert.equal(err.statusCode, 404);
    assert.equal(err.errorCode, 'NOTIFICATION_NOT_FOUND');
  });

  it('maps invalid ObjectId errors to 400 NOTIFICATION_INVALID_ID', () => {
    for (const name of ['CastError', 'BSONError']) {
      const mapped = toNotificationError(Object.assign(new Error('Cast to ObjectId failed'), { name }));
      assert.equal(mapped.statusCode, 400);
      assert.equal(mapped.errorCode, 'NOTIFICATION_INVALID_ID');
    }
  });

  it('turns unknown errors into 500 without leaking the raw message', () => {
    const mapped = toNotificationError(new Error('E11000 duplicate key notifications.userId_1'));
    assert.equal(mapped.statusCode, 500);
    assert.equal(mapped.errorCode, 'NOTIFICATION_INTERNAL_ERROR');
    assert.ok(!String(mapped.message).includes('E11000'));
  });

  it('validationError is a 400 with business message', () => {
    const err = validationError('roomId is required');
    assert.equal(err.statusCode, 400);
    assert.equal(err.errorCode, 'NOTIFICATION_VALIDATION_ERROR');
  });

  it('exposes caps', () => {
    assert.equal(BULK_MAX_USER_IDS, 2000);
    assert.equal(MAX_PAGE, 500);
  });
});

describe('sendErrorFromCatch via service helper', () => {
  it('500 returns generic message and internal code', () => {
    const res = mockRes();
    sendErrorFromCatch(res, toNotificationError(new Error('mongo exploded at host x')), 500, 'fallback', 'NOTIFICATION_INTERNAL_ERROR');
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.messageUser, GENERIC_5XX_MESSAGE);
    assert.equal(res.body.errorCode, 'NOTIFICATION_INTERNAL_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('mongo exploded'));
  });

  it('404 keeps Vietnamese business message', () => {
    const res = mockRes();
    sendErrorFromCatch(res, notFoundError(), 500, 'fallback', 'NOTIFICATION_INTERNAL_ERROR');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'NOTIFICATION_NOT_FOUND');
    assert.equal(res.body.messageUser, 'Không tìm thấy thông báo');
  });

  it('sendServiceError 400 keeps message', () => {
    const res = mockRes();
    sendServiceError(res, 400, { errorCode: 'NOTIFICATION_BULK_TOO_LARGE', message: 'too many' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'NOTIFICATION_BULK_TOO_LARGE');
    assert.equal(res.body.message, 'too many');
  });
});

describe('errorHandler', () => {
  it('maps malformed JSON to 400 NOTIFICATION_INVALID_JSON', () => {
    const res = mockRes();
    const err = Object.assign(new SyntaxError('Unexpected token b in JSON'), {
      type: 'entity.parse.failed',
      status: 400,
      body: '{bad',
    });
    errorHandler(err, mockReq, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'NOTIFICATION_INVALID_JSON');
    assert.ok(!JSON.stringify(res.body).includes('Unexpected token'));
  });

  it('maps oversized body to 413', () => {
    const res = mockRes();
    errorHandler(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }), mockReq, res, () => {});
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.errorCode, 'NOTIFICATION_PAYLOAD_TOO_LARGE');
  });

  it('passes other 4xx through', () => {
    const res = mockRes();
    errorHandler(notFoundError(), mockReq, res, () => {});
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'NOTIFICATION_NOT_FOUND');
  });

  it('hides unknown errors behind generic 500', () => {
    const res = mockRes();
    errorHandler(new Error('ECONNREFUSED 10.0.0.5:27017'), mockReq, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.messageUser, GENERIC_5XX_MESSAGE);
    assert.equal(res.body.errorCode, 'NOTIFICATION_INTERNAL_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('ECONNREFUSED'));
  });

  it('delegates when headers are already sent', () => {
    const res = mockRes();
    res.headersSent = true;
    let forwarded = null;
    const err = new Error('late');
    errorHandler(err, mockReq, res, (e) => {
      forwarded = e;
    });
    assert.equal(forwarded, err);
    assert.equal(res.statusCode, null);
  });

  it('notFoundHandler returns JSON 404', () => {
    const res = mockRes();
    notFoundHandler({ method: 'GET', originalUrl: '/api/notifications-x' }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'NOTIFICATION_ROUTE_NOT_FOUND');
    assert.equal(res.body.success, false);
  });
});

describe('toClientNotification', () => {
  const doc = {
    _id: 'n1',
    userId: 'u1',
    type: 'system',
    title: 'Hello',
    content: 'World',
    isRead: false,
    readAt: null,
    encV: 1,
    __v: 0,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    data: { kind: 'x', organizationId: 'o1' },
    actionUrl: '/app/notifications',
    toObject() {
      return { ...this };
    },
  };

  it('omits userId, readAt, encV, __v', () => {
    const out = toClientNotification(doc);
    for (const key of ['userId', 'readAt', 'encV', '__v', 'toObject']) {
      assert.equal(key in out, false, `${key} must be omitted`);
    }
    assert.equal(out.id, 'n1');
    assert.equal(out.title, 'Hello');
    assert.deepEqual(out.data, { kind: 'x', organizationId: 'o1' });
  });

  it('ignores legacy fields=full option', () => {
    assert.deepEqual(toClientNotification(doc, { fields: 'full' }), toClientNotification(doc));
  });
});

describe('bulk per-user events', () => {
  it('each recipient only receives their own notification', () => {
    const entries = ['u1', 'u2', 'u3'].map((userId, i) => ({
      userId,
      notification: { id: `n${i + 1}`, title: 't' },
    }));
    const events = buildPerUserBulkEvents(entries, 'ts');
    assert.equal(events.length, 3);
    events.forEach((evt, i) => {
      assert.equal(evt.event, 'notification:bulk_new');
      assert.equal(evt.userId, `u${i + 1}`);
      assert.equal('userIds' in evt, false);
      assert.equal(evt.payload.notifications.length, 1);
      assert.equal(evt.payload.notifications[0].id, `n${i + 1}`);
      assert.equal(evt.payload.timestamp, 'ts');
    });
  });

  it('skips incomplete entries', () => {
    assert.equal(buildPerUserBulkEvents([{ userId: '', notification: {} }, null], 'ts').length, 0);
  });

  it('runWithConcurrency caps parallel tasks and keeps order', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 25 }, (_, i) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return i;
    });
    const results = await runWithConcurrency(tasks, 10);
    assert.ok(peak <= 10, `peak ${peak} > 10`);
    assert.deepEqual(results, Array.from({ length: 25 }, (_, i) => i));
  });
});
