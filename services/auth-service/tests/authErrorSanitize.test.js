const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const { toAuthError, isSafeErrorCode, timingSafeStringEquals } = require('../src/utils/authErrorMap');
const { validatePasswordStrength, comparePassword } = require('../src/utils/password');

const appPath = path.resolve(__dirname, '../src/app.js');
const routesPath = path.resolve(__dirname, '../src/routes/auth.routes.js');

function businessError(message, statusCode, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

describe('toAuthError', () => {
  it('keeps business 4xx errors with a safe errorCode', () => {
    const out = toAuthError(businessError('Email đã được sử dụng', 400, 'AUTH_EMAIL_EXISTS'));
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'AUTH_EMAIL_EXISTS');
    assert.equal(out.messageUser, 'Email đã được sử dụng');
  });

  it('maps CastError to 400 AUTH_INVALID_ID without leaking the Mongo message', () => {
    const err = new Error('Cast to ObjectId failed for value "abc" at path "userId"');
    err.name = 'CastError';
    const out = toAuthError(err, 400);
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'AUTH_INVALID_ID');
    assert.equal(out.messageUser.includes('ObjectId'), false);
  });

  it('maps URIError to 401 AUTH_INVALID_TOKEN', () => {
    const out = toAuthError(new URIError('URI malformed'), 400);
    assert.equal(out.statusCode, 401);
    assert.equal(out.errorCode, 'AUTH_INVALID_TOKEN');
  });

  it('maps bcrypt/infra errors to generic 500 even with a 4xx fallback', () => {
    const out = toAuthError(new Error('data and hash arguments required'), 400);
    assert.equal(out.statusCode, 500);
    assert.equal(out.errorCode, 'AUTH_INTERNAL_ERROR');
    assert.equal(out.messageUser.includes('hash'), false);
  });

  it('drops malformed errorCode values', () => {
    const err = businessError('boom', 400, 'ECONNREFUSED 127.0.0.1');
    const out = toAuthError(err, 400);
    assert.equal(out.statusCode, 500);
    assert.equal(out.errorCode, 'AUTH_INTERNAL_ERROR');
    assert.equal(isSafeErrorCode('ECONNREFUSED 127.0.0.1'), false);
    assert.equal(isSafeErrorCode('E11000'), true);
    assert.equal(isSafeErrorCode('auth_lower'), false);
  });

  it('hides messages of coded 5xx errors', () => {
    const out = toAuthError(businessError('Mongo pool closed at host x', 503, 'AUTH_DB_UNAVAILABLE'));
    assert.equal(out.statusCode, 503);
    assert.equal(out.messageUser.includes('Mongo'), false);
  });

  it('maps body-parser errors', () => {
    assert.equal(toAuthError({ type: 'entity.too.large' }).statusCode, 413);
    assert.equal(toAuthError({ type: 'entity.parse.failed' }).errorCode, 'AUTH_INVALID_JSON');
  });
});

describe('timingSafeStringEquals', () => {
  it('compares strings safely including different lengths', () => {
    assert.equal(timingSafeStringEquals('abc', 'abc'), true);
    assert.equal(timingSafeStringEquals('abc', 'abcd'), false);
    assert.equal(timingSafeStringEquals('abc', null), false);
  });
});

describe('password utils', () => {
  it('rejects passwords longer than 72 UTF-8 bytes with AUTH_PASSWORD_TOO_LONG', () => {
    const tooLong = `Aa1!${'ă'.repeat(40)}`;
    const result = validatePasswordStrength(tooLong);
    assert.equal(result.isValid, false);
    assert.equal(result.errorCode, 'AUTH_PASSWORD_TOO_LONG');
  });

  it('flags weak passwords with AUTH_WEAK_PASSWORD', () => {
    const result = validatePasswordStrength('short');
    assert.equal(result.isValid, false);
    assert.equal(result.errorCode, 'AUTH_WEAK_PASSWORD');
  });

  it('accepts a strong password', () => {
    assert.equal(validatePasswordStrength('StrongPass1!').isValid, true);
  });

  it('comparePassword returns false for non-string input without calling bcrypt', async () => {
    assert.equal(await comparePassword({ $ne: null }, '$2b$12$abc'), false);
    assert.equal(await comparePassword('x', undefined), false);
  });
});

describe('app error contract', () => {
  let server;
  let baseUrl;
  const savedEnv = {};

  before(async () => {
    for (const key of ['NODE_ENV', 'AUTH_JSON_LIMIT']) savedEnv[key] = process.env[key];
    process.env.NODE_ENV = 'development';
    process.env.AUTH_JSON_LIMIT = '1kb';

    const router = express.Router();
    router.post('/echo', (req, res) => res.json({ ok: true }));
    router.get('/cast', () => {
      const err = new Error('Cast to ObjectId failed for value "zzz"');
      err.name = 'CastError';
      throw err;
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
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns 400 AUTH_INVALID_JSON for malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/api/auth/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":',
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.errorCode, 'AUTH_INVALID_JSON');
    assert.equal('stack' in body, false);
  });

  it('returns 413 AUTH_PAYLOAD_TOO_LARGE above AUTH_JSON_LIMIT', async () => {
    const res = await fetch(`${baseUrl}/api/auth/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(4096) }),
    });
    const body = await res.json();
    assert.equal(res.status, 413);
    assert.equal(body.errorCode, 'AUTH_PAYLOAD_TOO_LARGE');
  });

  it('returns 404 AUTH_ROUTE_NOT_FOUND and no x-powered-by header', async () => {
    const res = await fetch(`${baseUrl}/api/auth/does-not-exist`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.errorCode, 'AUTH_ROUTE_NOT_FOUND');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('errorHandler maps CastError to 400 and never returns stack in development', async () => {
    const res = await fetch(`${baseUrl}/api/auth/cast`);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.errorCode, 'AUTH_INVALID_ID');
    assert.equal('stack' in body, false);
    assert.equal(JSON.stringify(body).includes('zzz'), false);
  });

  it('errorHandler hides unknown error messages', async () => {
    const res = await fetch(`${baseUrl}/api/auth/boom`);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.errorCode, 'AUTH_INTERNAL_ERROR');
    assert.equal(JSON.stringify(body).includes('secret internal detail'), false);
    assert.equal('stack' in body, false);
  });
});
