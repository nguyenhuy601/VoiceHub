const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Pure helper mirror — auth.service opaqueLoginFailure shape.
 * Full login() needs Mongo; we assert contract used by controller logging.
 */
function opaqueLoginFailure(internalErrorCode) {
  const err = new Error('Email hoặc mật khẩu không đúng');
  err.statusCode = 401;
  err.errorCode = 'AUTH_INVALID_CREDENTIALS';
  Object.defineProperty(err, 'internalErrorCode', {
    value: String(internalErrorCode || 'AUTH_INVALID_CREDENTIALS'),
    enumerable: false,
  });
  return err;
}

describe('loginEnumeration opaque errors', () => {
  it('client errorCode is always AUTH_INVALID_CREDENTIALS', () => {
    for (const code of [
      'AUTH_ACCOUNT_LOCKED',
      'AUTH_PENDING_ACTIVATION',
      'AUTH_EMAIL_NOT_VERIFIED',
      'AUTH_ACCOUNT_INACTIVE',
    ]) {
      const err = opaqueLoginFailure(code);
      assert.equal(err.errorCode, 'AUTH_INVALID_CREDENTIALS');
      assert.equal(err.internalErrorCode, code);
      assert.ok(!Object.keys(err).includes('internalErrorCode'));
    }
  });
});
