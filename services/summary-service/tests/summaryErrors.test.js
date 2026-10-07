const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.GATEWAY_INTERNAL_TOKEN = process.env.GATEWAY_INTERNAL_TOKEN || 'test-gateway-token';

const {
  SUMMARY_ERRORS,
  SummaryError,
  resolveSummaryError,
  sendSummaryError,
} = require('../src/utils/summaryErrors');
const { errorHandler, notFoundHandler } = require('../src/middleware/errorHandler');

function createRes() {
  return {
    statusCode: 200,
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

function silenceConsoleError(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

describe('summaryErrors', () => {
  it('maps every code to its declared status and message', () => {
    for (const [code, { status, message }] of Object.entries(SUMMARY_ERRORS)) {
      const res = createRes();
      sendSummaryError(res, new SummaryError(code));
      assert.equal(res.statusCode, status, code);
      assert.deepEqual(res.body, { success: false, message, messageUser: message, errorCode: code });
    }
  });

  it('unknown code and plain Error resolve to generic 500 without leaking message', () => {
    assert.equal(new SummaryError('NOPE').code, 'SUMMARY_INTERNAL');
    const resolved = resolveSummaryError(new Error('connect ECONNREFUSED 10.0.0.5:3013'));
    assert.equal(resolved.status, 500);
    assert.equal(resolved.code, 'SUMMARY_INTERNAL');
    assert.ok(!resolved.message.includes('ECONNREFUSED'));
  });

  it('does not write when headers already sent', () => {
    const res = createRes();
    res.headersSent = true;
    sendSummaryError(res, new SummaryError('SUMMARY_FORBIDDEN'));
    assert.equal(res.body, null);
  });
});

describe('errorHandler', () => {
  const req = { method: 'GET', baseUrl: '/api/ai/summaries', route: { path: '/:id' }, user: null };

  it('CastError -> 400', () => {
    const res = createRes();
    const err = Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError' });
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'SUMMARY_BAD_REQUEST');
  });

  it('malformed JSON body -> 400, oversized body -> 413', () => {
    const parseRes = createRes();
    errorHandler(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' }), req, parseRes, () => {});
    assert.equal(parseRes.statusCode, 400);

    const largeRes = createRes();
    errorHandler(Object.assign(new Error('request entity too large'), { type: 'entity.too.large' }), req, largeRes, () => {});
    assert.equal(largeRes.statusCode, 413);
    assert.equal(largeRes.body.errorCode, 'SUMMARY_PAYLOAD_TOO_LARGE');
  });

  it('unexpected error -> 500 generic body', () => {
    const res = createRes();
    silenceConsoleError(() => errorHandler(new Error('mongo host db-1:27017 down'), req, res, () => {}));
    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify(res.body).includes('db-1'));
  });

  it('notFoundHandler -> 404 JSON', () => {
    const res = createRes();
    notFoundHandler(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'SUMMARY_ROUTE_NOT_FOUND');
  });
});

describe('app wiring (in-process HTTP)', () => {
  let server;
  let baseUrl;
  const authHeaders = {
    'x-user-id': '64b000000000000000000001',
    'x-gateway-internal-token': process.env.GATEWAY_INTERNAL_TOKEN,
  };

  before(async () => {
    const app = require('../src/app');
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('invalid :id -> 400 JSON without x-powered-by', async () => {
    const res = await fetch(`${baseUrl}/api/ai/summaries/abc`, { headers: authHeaders });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get('x-powered-by'), null);
    const body = await res.json();
    assert.equal(body.errorCode, 'SUMMARY_BAD_REQUEST');
  });

  it('unknown route -> 404 JSON', async () => {
    const res = await fetch(`${baseUrl}/api/ai/summaries/64b000000000000000000001/extra`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).errorCode, 'SUMMARY_ROUTE_NOT_FOUND');
  });

  it('body over 16kb -> 413 JSON', async () => {
    const res = await fetch(`${baseUrl}/api/ai/summaries`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(20 * 1024) }),
    });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).errorCode, 'SUMMARY_PAYLOAD_TOO_LARGE');
  });

  it('malformed JSON -> 400 JSON', async () => {
    const res = await fetch(`${baseUrl}/api/ai/summaries`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: '{"organizationId":',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, 'SUMMARY_BAD_REQUEST');
  });
});
