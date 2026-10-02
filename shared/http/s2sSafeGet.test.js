const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withSafeGetRetry, isRetryableAxiosError } = require('./s2sSafeGet');

describe('isRetryableAxiosError', () => {
  it('retries 5xx and 429', () => {
    assert.equal(isRetryableAxiosError({ response: { status: 503 } }), true);
    assert.equal(isRetryableAxiosError({ response: { status: 429 } }), true);
  });
  it('does not retry 4xx business', () => {
    assert.equal(isRetryableAxiosError({ response: { status: 400 } }), false);
    assert.equal(isRetryableAxiosError({ response: { status: 404 } }), false);
  });
  it('retries network/timeout', () => {
    assert.equal(isRetryableAxiosError({ code: 'ECONNABORTED' }), true);
    assert.equal(isRetryableAxiosError({ code: 'ENOTFOUND' }), true);
  });
});

describe('withSafeGetRetry', () => {
  it('does not retry POST', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withSafeGetRetry(
          async () => {
            calls += 1;
            const err = new Error('fail');
            err.response = { status: 503 };
            throw err;
          },
          { method: 'post', maxAttempts: 3, baseDelayMs: 1, jitterMs: 0 }
        ),
      /fail/
    );
    assert.equal(calls, 1);
  });

  it('retries GET up to maxAttempts', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withSafeGetRetry(
          async () => {
            calls += 1;
            const err = new Error('down');
            err.response = { status: 503 };
            throw err;
          },
          { method: 'get', maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, jitterMs: 0 }
        ),
      /down/
    );
    assert.equal(calls, 3);
  });

  it('returns on success after transient failure', async () => {
    let calls = 0;
    const res = await withSafeGetRetry(
      async () => {
        calls += 1;
        if (calls < 2) {
          const err = new Error('flaky');
          err.response = { status: 502 };
          throw err;
        }
        return { status: 200, data: { ok: true } };
      },
      { method: 'get', maxAttempts: 3, baseDelayMs: 1, jitterMs: 0 }
    );
    assert.equal(res.data.ok, true);
    assert.equal(calls, 2);
  });
});
