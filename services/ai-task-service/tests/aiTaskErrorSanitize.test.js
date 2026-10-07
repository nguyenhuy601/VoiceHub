const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeCaughtError,
  sanitizeUpstreamMessage,
} = require('../src/utils/aiTaskErrorSanitize');

describe('sanitizeCaughtError', () => {
  it('maps ECONNREFUSED to 503', () => {
    const out = sanitizeCaughtError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:27017' });
    assert.equal(out.status, 503);
    assert.equal(out.errorCode, 'AI_UPSTREAM_UNAVAILABLE');
    assert.equal(out.message.includes('ECONNREFUSED'), false);
  });

  it('maps CastError to 400', () => {
    const out = sanitizeCaughtError({ name: 'CastError', message: 'Cast to ObjectId failed' });
    assert.equal(out.status, 400);
    assert.equal(out.errorCode, 'VALIDATION_INVALID_ID');
  });

  it('uses known code message', () => {
    const out = sanitizeCaughtError(
      { statusCode: 403, errorCode: 'AI_EXTRACT_FORBIDDEN', message: 'internal leak' },
      { fallbackCode: 'AI_EXTRACT_FORBIDDEN', fallbackStatus: 403 }
    );
    assert.equal(out.errorCode, 'AI_EXTRACT_FORBIDDEN');
    assert.equal(out.message.includes('leak'), false);
  });

  it('500 generic for unknown', () => {
    const out = sanitizeCaughtError(new TypeError('x is not a function'));
    assert.equal(out.status, 500);
    assert.equal(out.errorCode, 'AI_INTERNAL_ERROR');
  });
});

describe('sanitizeUpstreamMessage', () => {
  it('blocks Cast/ECONNREFUSED', () => {
    assert.equal(
      sanitizeUpstreamMessage('Cast to ObjectId failed for value', 'fallback'),
      'fallback'
    );
  });

  it('allows short safe business message', () => {
    assert.equal(sanitizeUpstreamMessage('Board title required', 'fallback'), 'Board title required');
  });
});
