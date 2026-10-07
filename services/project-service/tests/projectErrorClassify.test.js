const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');
const {
  classifyProjectError,
  sanitizeErrorCode,
  MSG,
} = require('../src/utils/projectErrorClassify');

describe('sanitizeErrorCode', () => {
  it('rejects system codes', () => {
    assert.equal(sanitizeErrorCode('11000'), undefined);
    assert.equal(sanitizeErrorCode(11000), undefined);
    assert.equal(sanitizeErrorCode('ECONNREFUSED'), undefined);
    assert.equal(sanitizeErrorCode('ERR_BAD_REQUEST'), undefined);
    assert.equal(sanitizeErrorCode('LIMIT_FILE_SIZE'), undefined);
  });

  it('keeps SAFE business codes', () => {
    assert.equal(sanitizeErrorCode('SPRINT_CREATE_FAILED'), 'SPRINT_CREATE_FAILED');
    assert.equal(sanitizeErrorCode('VALIDATION_INVALID_ID'), 'VALIDATION_INVALID_ID');
  });
});

describe('classifyProjectError', () => {
  it('CastError → 400 INVALID_ID without cast text', () => {
    const err = new Error('Cast to ObjectId failed for value "abc" (type string) at path "_id" for model "Task"');
    err.name = 'CastError';
    const c = classifyProjectError(err, 400);
    assert.equal(c.status, 400);
    assert.equal(c.errorCode, 'VALIDATION_INVALID_ID');
    assert.equal(c.messageUser, MSG.INVALID_ID);
    assert.ok(!c.messageUser.includes('Cast'));
    assert.ok(!c.messageUser.includes('ObjectId'));
  });

  it('BSONError → 400 INVALID_ID', () => {
    const err = new Error('Argument passed in must be a string of 12 bytes');
    err.name = 'BSONError';
    const c = classifyProjectError(err);
    assert.equal(c.status, 400);
    assert.equal(c.errorCode, 'VALIDATION_INVALID_ID');
  });

  it('ValidationError → 400 VALIDATION_FAILED', () => {
    const err = new Error('Task validation failed');
    err.name = 'ValidationError';
    err.errors = { title: { message: 'required' } };
    const c = classifyProjectError(err);
    assert.equal(c.status, 400);
    assert.equal(c.errorCode, 'VALIDATION_FAILED');
  });

  it('Mongo 11000 → 409 without E11000 text', () => {
    const err = new Error('E11000 duplicate key error collection: tasks index: key_1');
    err.name = 'MongoServerError';
    err.code = 11000;
    const c = classifyProjectError(err);
    assert.equal(c.status, 409);
    assert.equal(c.errorCode, 'DUPLICATE_RESOURCE');
    assert.ok(!c.messageUser.includes('E11000'));
  });

  it('axios ECONNREFUSED → 503 without IP', () => {
    const err = new Error('connect ECONNREFUSED 10.0.0.5:3003');
    err.isAxiosError = true;
    err.code = 'ECONNREFUSED';
    const c = classifyProjectError(err);
    assert.equal(c.status, 503);
    assert.equal(c.errorCode, 'UPSTREAM_UNAVAILABLE');
    assert.ok(!c.messageUser.includes('10.0.0.5'));
    assert.ok(!c.messageUser.includes('ECONNREFUSED'));
  });

  it('TypeError → 500 generic', () => {
    const err = new TypeError('Cannot read properties of undefined');
    const c = classifyProjectError(err);
    assert.equal(c.status, 500);
    assert.equal(c.messageUser, GENERIC_5XX_MESSAGE);
    assert.equal(c.isInternal, true);
  });

  it('plain business Error keeps message with fallback 400', () => {
    const err = new Error('Tiêu đề bắt buộc');
    const c = classifyProjectError(err, 400);
    assert.equal(c.status, 400);
    assert.equal(c.messageUser, 'Tiêu đề bắt buộc');
    assert.equal(c.isInternal, false);
  });

  it('Error with statusCode 403 keeps messageUser', () => {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    err.messageUser = 'Bạn không có quyền';
    err.errorCode = 'ORG_ACCESS_DENIED';
    const c = classifyProjectError(err, 400);
    assert.equal(c.status, 403);
    assert.equal(c.messageUser, 'Bạn không có quyền');
    assert.equal(c.errorCode, 'ORG_ACCESS_DENIED');
  });

  it('Multer LIMIT_FILE_SIZE → 413', () => {
    const err = new Error('File too large');
    err.name = 'MulterError';
    err.code = 'LIMIT_FILE_SIZE';
    const c = classifyProjectError(err);
    assert.equal(c.status, 413);
    assert.equal(c.errorCode, 'PROJECT_UPLOAD_TOO_LARGE');
  });

  it('entity.parse.failed → 400 BAD_JSON', () => {
    const err = new SyntaxError('Unexpected token');
    err.type = 'entity.parse.failed';
    err.body = '{';
    const c = classifyProjectError(err);
    assert.equal(c.status, 400);
    assert.equal(c.errorCode, 'PROJECT_BAD_JSON');
  });

  it('entity.too.large → 413', () => {
    const err = new Error('too large');
    err.type = 'entity.too.large';
    const c = classifyProjectError(err);
    assert.equal(c.status, 413);
    assert.equal(c.errorCode, 'PROJECT_PAYLOAD_TOO_LARGE');
  });

  it('CORS blocked → 403', () => {
    const err = new Error('CORS blocked');
    const c = classifyProjectError(err);
    assert.equal(c.status, 403);
    assert.equal(c.errorCode, 'CORS_FORBIDDEN');
  });

  it('MongoNetworkError → 500 generic', () => {
    const err = new Error('connection timed out');
    err.name = 'MongoNetworkError';
    const c = classifyProjectError(err);
    assert.equal(c.status, 500);
    assert.equal(c.messageUser, GENERIC_5XX_MESSAGE);
  });
});
