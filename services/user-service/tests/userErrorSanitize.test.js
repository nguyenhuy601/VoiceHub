const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const { toUserError, isSafeErrorCode } = require('../src/utils/userErrorMap');

const appPath = path.resolve(__dirname, '../src/app.js');
const routesPath = path.resolve(__dirname, '../src/routes/user.routes.js');

const LEAK_MARKERS = ['E11000', 'Cast to', 'dup key', 'stack', 'phoneBlindIndex'];

function businessError(message, statusCode, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function duplicatePhoneError() {
  const err = new Error(
    'E11000 duplicate key error collection: users.userprofiles index: phoneBlindIndex_1 dup key: { phoneBlindIndex: "abc" }'
  );
  err.name = 'MongoServerError';
  err.code = 11000;
  err.keyPattern = { phoneBlindIndex: 1 };
  err.keyValue = { phoneBlindIndex: 'abc' };
  return err;
}

function assertNoLeak(payload) {
  const text = JSON.stringify(payload);
  for (const marker of LEAK_MARKERS) {
    assert.equal(text.includes(marker), false, `payload leaks "${marker}"`);
  }
}

describe('toUserError', () => {
  it('keeps business 4xx errors with a safe errorCode', () => {
    const out = toUserError(businessError('Không tìm thấy hồ sơ', 404, 'USER_PROFILE_NOT_FOUND'), 400);
    assert.equal(out.statusCode, 404);
    assert.equal(out.errorCode, 'USER_PROFILE_NOT_FOUND');
    assert.equal(out.messageUser, 'Không tìm thấy hồ sơ');
  });

  it('maps CastError to 400 USER_INVALID_ID without the Mongo message', () => {
    const err = new Error('Cast to ObjectId failed for value "abc" at path "userId"');
    err.name = 'CastError';
    const out = toUserError(err, 400);
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'USER_INVALID_ID');
    assertNoLeak(out);
  });

  it('maps duplicate phone to 409 USER_PHONE_UNAVAILABLE with a generic message', () => {
    const out = toUserError(duplicatePhoneError(), 400, 'Không thể cập nhật hồ sơ', 'USER_UPDATE_FAILED');
    assert.equal(out.statusCode, 409);
    assert.equal(out.errorCode, 'USER_PHONE_UNAVAILABLE');
    assertNoLeak(out);
  });

  it('maps other duplicate keys to 409 USER_CONFLICT', () => {
    const err = new Error('E11000 duplicate key error index: foo_1 dup key');
    err.code = 11000;
    const out = toUserError(err, 400);
    assert.equal(out.statusCode, 409);
    assert.equal(out.errorCode, 'USER_CONFLICT');
    assertNoLeak(out);
  });

  it('maps ValidationError to a generic validation message', () => {
    const err = new Error('UserProfile validation failed: status: `x` is not a valid enum value');
    err.name = 'ValidationError';
    const out = toUserError(err, 400);
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'USER_VALIDATION_ERROR');
    assert.equal(out.messageUser.includes('enum'), false);
  });

  it('uses the static fallback for uncoded errors under a 4xx fallback', () => {
    const out = toUserError(new Error('secret driver detail'), 400, 'Không thể cập nhật', 'USER_UPDATE_FAILED');
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'USER_UPDATE_FAILED');
    assert.equal(out.messageUser, 'Không thể cập nhật');
  });

  it('drops malformed errorCode values', () => {
    const out = toUserError(businessError('boom', 400, 'ECONNREFUSED 127.0.0.1'), 500);
    assert.equal(out.statusCode, 500);
    assert.equal(out.errorCode, 'USER_INTERNAL_ERROR');
    assert.equal(isSafeErrorCode('user_lower'), false);
  });

  it('hides messages of coded 5xx errors', () => {
    const out = toUserError(businessError('Mongo pool closed at host x', 503, 'USER_DB_UNAVAILABLE'));
    assert.equal(out.statusCode, 503);
    assert.equal(out.messageUser.includes('Mongo'), false);
  });

  it('maps body-parser and multer errors', () => {
    assert.equal(toUserError({ type: 'entity.too.large' }).statusCode, 413);
    assert.equal(toUserError({ type: 'entity.parse.failed' }).errorCode, 'USER_INVALID_JSON');
    const multerErr = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
    assert.equal(toUserError(multerErr).statusCode, 413);
  });
});

describe('user-service app error contract', () => {
  let server;
  let baseUrl;
  let savedAuthUrl;

  before(async () => {
    savedAuthUrl = process.env.AUTH_SERVICE_URL;
    process.env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service.test:3001';
    const router = express.Router();
    router.post('/echo', (req, res) => res.json({ ok: true }));
    router.get('/cast', () => {
      const err = new Error('Cast to ObjectId failed for value "zzz"');
      err.name = 'CastError';
      throw err;
    });
    router.get('/dup', () => {
      throw duplicatePhoneError();
    });
    router.get('/boom', () => {
      throw new Error('secret internal detail');
    });
    delete require.cache[appPath];
    require.cache[routesPath] = { id: routesPath, filename: routesPath, loaded: true, exports: router };

    const app = require(appPath);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[appPath];
    delete require.cache[routesPath];
    if (savedAuthUrl === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = savedAuthUrl;
  });

  it('returns 400 USER_INVALID_JSON for malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/api/users/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":',
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.errorCode, 'USER_INVALID_JSON');
    assertNoLeak(body);
  });

  it('returns 413 above the 2mb JSON limit', async () => {
    const res = await fetch(`${baseUrl}/api/users/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024 + 10) }),
    });
    const body = await res.json();
    assert.equal(res.status, 413);
    assert.equal(body.errorCode, 'USER_PAYLOAD_TOO_LARGE');
  });

  it('returns 404 USER_ROUTE_NOT_FOUND JSON and no x-powered-by header', async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.errorCode, 'USER_ROUTE_NOT_FOUND');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('blocks /uploads/cv with 404 before auth', async () => {
    const res = await fetch(`${baseUrl}/uploads/cv/cv-1.pdf`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).errorCode, 'USER_ROUTE_NOT_FOUND');
  });

  it('errorHandler maps CastError to 400 without leaking the value', async () => {
    const res = await fetch(`${baseUrl}/api/users/cast`);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.errorCode, 'USER_INVALID_ID');
    assert.equal(JSON.stringify(body).includes('zzz'), false);
    assertNoLeak(body);
  });

  it('errorHandler maps duplicate phone to 409 without dup key detail', async () => {
    const res = await fetch(`${baseUrl}/api/users/dup`);
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.errorCode, 'USER_PHONE_UNAVAILABLE');
    assertNoLeak(body);
  });

  it('errorHandler hides unknown error messages', async () => {
    const res = await fetch(`${baseUrl}/api/users/boom`);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.errorCode, 'USER_INTERNAL_ERROR');
    assert.equal(JSON.stringify(body).includes('secret internal detail'), false);
    assertNoLeak(body);
  });
});
