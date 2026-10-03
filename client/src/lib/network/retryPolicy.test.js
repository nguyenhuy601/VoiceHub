import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFailure,
  shouldRetry,
  computeBackoffDelayMs,
  parseRetryAfterMs,
  FAILURE_KIND,
} from './retryPolicy.js';

describe('classifyFailure', () => {
  it('marks offline context', () => {
    assert.equal(classifyFailure({}, { isOffline: true }), FAILURE_KIND.OFFLINE);
    assert.equal(
      classifyFailure({ code: 'NETWORK_OFFLINE' }),
      FAILURE_KIND.OFFLINE
    );
  });

  it('classifies HTTP statuses', () => {
    assert.equal(classifyFailure({ response: { status: 400 } }), FAILURE_KIND.BUSINESS_4XX);
    assert.equal(classifyFailure({ response: { status: 401 } }), FAILURE_KIND.AUTH_401);
    assert.equal(classifyFailure({ response: { status: 403 } }), FAILURE_KIND.BUSINESS_4XX);
    assert.equal(classifyFailure({ response: { status: 404 } }), FAILURE_KIND.BUSINESS_4XX);
    assert.equal(classifyFailure({ response: { status: 429 } }), FAILURE_KIND.RATE_LIMIT_429);
    assert.equal(classifyFailure({ response: { status: 500 } }), FAILURE_KIND.TRANSIENT_5XX);
    assert.equal(classifyFailure({ response: { status: 503 } }), FAILURE_KIND.TRANSIENT_5XX);
  });

  it('classifies timeout and network', () => {
    assert.equal(classifyFailure({ code: 'ECONNABORTED' }), FAILURE_KIND.TIMEOUT);
    assert.equal(classifyFailure({ code: 'ERR_NETWORK' }), FAILURE_KIND.NETWORK);
    assert.equal(classifyFailure({ message: 'Network Error' }), FAILURE_KIND.NETWORK);
  });
});

describe('shouldRetry', () => {
  it('never retries POST mutations', () => {
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.TRANSIENT_5XX, method: 'post', attempt: 0 }),
      false
    );
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.NETWORK, method: 'put', attempt: 0 }),
      false
    );
  });

  it('retries GET for transient errors within budget', () => {
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.TRANSIENT_5XX, method: 'get', attempt: 0, maxAttempts: 4 }),
      true
    );
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.NETWORK, method: 'get', attempt: 3, maxAttempts: 4 }),
      false
    );
  });

  it('does not retry business 4xx or offline', () => {
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.BUSINESS_4XX, method: 'get', attempt: 0 }),
      false
    );
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.OFFLINE, method: 'get', attempt: 0 }),
      false
    );
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.AUTH_401, method: 'get', attempt: 0 }),
      false
    );
  });

  it('retries 429 for GET', () => {
    assert.equal(
      shouldRetry({ kind: FAILURE_KIND.RATE_LIMIT_429, method: 'get', attempt: 0 }),
      true
    );
  });
});

describe('computeBackoffDelayMs', () => {
  it('uses exponential growth with jitter', () => {
    const d0 = computeBackoffDelayMs(0, { baseDelayMs: 1000, maxDelayMs: 16000, jitterMs: 0, random: () => 0 });
    const d1 = computeBackoffDelayMs(1, { baseDelayMs: 1000, maxDelayMs: 16000, jitterMs: 0, random: () => 0 });
    const d2 = computeBackoffDelayMs(2, { baseDelayMs: 1000, maxDelayMs: 16000, jitterMs: 0, random: () => 0 });
    assert.equal(d0, 1000);
    assert.equal(d1, 2000);
    assert.equal(d2, 4000);
  });

  it('caps at maxDelay', () => {
    const d = computeBackoffDelayMs(10, { baseDelayMs: 1000, maxDelayMs: 8000, jitterMs: 0, random: () => 0 });
    assert.equal(d, 8000);
  });

  it('honors Retry-After when provided', () => {
    const d = computeBackoffDelayMs(0, {
      retryAfterMs: 2500,
      maxDelayMs: 16000,
      jitterMs: 0,
      random: () => 0,
    });
    assert.equal(d, 2500);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses seconds', () => {
    assert.equal(parseRetryAfterMs('2'), 2000);
    assert.equal(parseRetryAfterMs(1.5), 1500);
  });

  it('returns null for empty', () => {
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs(''), null);
  });
});
