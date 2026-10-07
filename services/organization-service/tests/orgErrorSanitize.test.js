const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

const { toOrgError, maskEmail, GENERIC_INTERNAL_MESSAGE } = require('../src/utils/orgErrorMap');
const errorHandler = require('../src/middleware/errorHandler');
const { orgFail, orgCatch } = require('../src/utils/orgApiError');

function mockRes() {
  return {
    statusCode: 0,
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

const LEAK_PATTERN = /stack|ECONNREFUSED|Cast to ObjectId|E11000|dup key|organization-service:|at .*\.js/i;

describe('toOrgError', () => {
  it('maps CastError to 400 ORG_INVALID_ID', () => {
    const err = Object.assign(new Error('Cast to ObjectId failed for value "abc"'), { name: 'CastError' });
    const out = toOrgError(err);
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'ORG_INVALID_ID');
    assert.doesNotMatch(out.messageUser, LEAK_PATTERN);
  });

  it('maps duplicate key to 409 generic', () => {
    const err = Object.assign(new Error('E11000 duplicate key error index: slug_1 dup key'), { code: 11000 });
    const out = toOrgError(err);
    assert.equal(out.statusCode, 409);
    assert.equal(out.errorCode, 'ORG_DUPLICATE');
    assert.doesNotMatch(out.messageUser, LEAK_PATTERN);
  });

  it('maps ValidationError to 400 generic', () => {
    const err = Object.assign(new Error('Department validation failed: name: Path `name` is required.'), {
      name: 'ValidationError',
    });
    const out = toOrgError(err);
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'ORG_VALIDATION_FAILED');
    assert.doesNotMatch(out.messageUser, /Path/);
  });

  it('never leaks axios-like errors', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED auth-service:3001'), {
      name: 'AxiosError',
      config: { headers: { 'x-gateway-internal-token': 'secret' } },
      statusCode: 400,
    });
    const out = toOrgError(err, 400, 'Không tạo được tài khoản');
    assert.doesNotMatch(out.messageUser, LEAK_PATTERN);
    assert.equal(out.messageUser, 'Không tạo được tài khoản');
  });

  it('hides 5xx domain messages', () => {
    const err = Object.assign(new Error('chat-service returned 502 at /internal/x'), {
      statusCode: 502,
      errorCode: 'DOCS_UPSTREAM',
    });
    const out = toOrgError(err);
    assert.equal(out.statusCode, 502);
    assert.equal(out.messageUser, GENERIC_INTERNAL_MESSAGE);
  });

  it('keeps 4xx domain message with explicit statusCode', () => {
    const err = Object.assign(new Error('Phòng ban không tồn tại'), { statusCode: 404 });
    const out = toOrgError(err, 500, '', 'ORG_NOT_FOUND');
    assert.equal(out.statusCode, 404);
    assert.equal(out.messageUser, 'Phòng ban không tồn tại');
    assert.equal(out.errorCode, 'ORG_NOT_FOUND');
  });

  it('does not trust unsafe errorCode', () => {
    const err = Object.assign(new Error('x'), { statusCode: 400, errorCode: 'bad code <script>' });
    const out = toOrgError(err);
    assert.equal(out.errorCode, 'ORG_BAD_REQUEST');
  });

  it('uses fallback message (not err.message) when error has no statusCode', () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'organization')");
    const out = toOrgError(err, 400, 'Import thất bại.', 'RESOURCE_IMPORT_FAILED');
    assert.equal(out.statusCode, 400);
    assert.equal(out.messageUser, 'Import thất bại.');
    assert.equal(out.errorCode, 'RESOURCE_IMPORT_FAILED');
  });

  it('maps multer LIMIT_FILE_SIZE to 413', () => {
    const err = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
    const out = toOrgError(err);
    assert.equal(out.statusCode, 413);
    assert.equal(out.errorCode, 'ORG_PAYLOAD_TOO_LARGE');
  });

  it('maps body parse errors', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), { type: 'entity.too.large' });
    assert.equal(toOrgError(tooLarge).statusCode, 413);
    const parse = Object.assign(new SyntaxError('Unexpected token } in JSON at position 3'), {
      type: 'entity.parse.failed',
      body: '{"a":}',
    });
    const out = toOrgError(parse);
    assert.equal(out.statusCode, 400);
    assert.equal(out.errorCode, 'ORG_INVALID_JSON');
    assert.doesNotMatch(out.messageUser, /position/);
  });
});

describe('errorHandler', () => {
  it('returns sanitized body without stack', () => {
    const res = mockRes();
    const err = new ReferenceError('Department is not defined');
    errorHandler(err, { method: 'POST', originalUrl: '/api/organizations/x/members/invite', params: {} }, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.errorCode, 'ORG_INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /Department is not defined|stack/);
  });
});

describe('orgApiError helpers', () => {
  it('orgFail hides message for 5xx', () => {
    const res = mockRes();
    orgFail(res, 500, 'connect ECONNREFUSED 10.0.0.5:3001', 'X_FAIL');
    assert.equal(res.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(res.body), /ECONNREFUSED/);
  });

  it('orgCatch maps CastError to 400', () => {
    const res = mockRes();
    orgCatch(res, Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'ORG_INVALID_ID');
  });
});

describe('maskEmail', () => {
  it('masks local part', () => {
    assert.equal(maskEmail('alice@corp.vn'), 'a***@corp.vn');
    assert.equal(maskEmail(''), '');
    assert.equal(maskEmail('noat'), '***');
  });
});
