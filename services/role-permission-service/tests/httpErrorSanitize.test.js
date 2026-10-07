/**
 * Wave 2 — role-permission 5xx sanitize (sendErrorFromCatch / httpErrorResponse).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  GENERIC_5XX_MESSAGE,
} = require('@enterprise/shared/middleware/httpErrorResponse');
const {
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE,
} = require('../src/middleware/sendServiceError');

function mockRes() {
  const state = { statusCode: null, body: null };
  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    },
    get headersSent() {
      return false;
    },
  };
}

describe('role-permission httpErrorSanitize', () => {
  it('5xx uses GENERIC_5XX_MESSAGE and ROLE_INTERNAL_ERROR — no raw err.message', () => {
    const res = mockRes();
    const leak =
      'Error getting user permissions: MongoServerError ECONNREFUSED 127.0.0.1:27017';
    const err = new Error(leak);
    err.statusCode = 500;

    sendErrorFromCatch(res, err, 500, 'Không thể tải quyền người dùng', 'PERMISSION_GET_FAILED');

    assert.equal(res.state.statusCode, 500);
    assert.equal(res.state.body.success, false);
    assert.equal(res.state.body.message, GENERIC_5XX_MESSAGE);
    assert.equal(res.state.body.messageUser, GENERIC_5XX_MESSAGE);
    assert.equal(res.state.body.errorCode, 'PERMISSION_GET_FAILED');
    assert.equal(String(res.state.body.message).includes('MongoServerError'), false);
    assert.equal(String(res.state.body.message).includes('ECONNREFUSED'), false);
    assert.equal(String(res.state.body.message).includes('Error getting user permissions'), false);
    assert.equal(String(res.state.body.messageUser).includes(leak), false);
  });

  it('5xx without errorCode falls back to ROLE_INTERNAL_ERROR', () => {
    const res = mockRes();
    const err = new Error('secret internal stack path');
    err.statusCode = 500;

    sendErrorFromCatch(res, err, 500, 'fallback');

    assert.equal(res.state.statusCode, 500);
    assert.equal(res.state.body.message, GENERIC_5XX_MESSAGE);
    assert.equal(res.state.body.messageUser, GENERIC_5XX_MESSAGE);
    assert.equal(res.state.body.errorCode, INTERNAL_ERROR_CODE);
    assert.equal(String(res.state.body.message).includes('secret'), false);
  });

  it('4xx keeps business message from err', () => {
    const res = mockRes();
    const err = new Error('organizationId is required');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_FAILED';

    sendErrorFromCatch(res, err, 400, 'Bad request', 'VALIDATION_FAILED');

    assert.equal(res.state.statusCode, 400);
    assert.equal(res.state.body.message, 'organizationId is required');
    assert.equal(res.state.body.messageUser, 'organizationId is required');
    assert.equal(res.state.body.errorCode, 'VALIDATION_FAILED');
  });

  it('missing statusCode on err uses fallbackStatus; 500 still sanitized', () => {
    const res = mockRes();
    const err = new Error('Error getting user permissions: boom');

    sendErrorFromCatch(res, err, 500, 'Không thể tải', 'PERMISSION_GET_FAILED');

    assert.equal(res.state.statusCode, 500);
    assert.equal(res.state.body.message, GENERIC_5XX_MESSAGE);
    assert.equal(String(res.state.body.messageUser).includes('Error getting user permissions'), false);
  });
});
