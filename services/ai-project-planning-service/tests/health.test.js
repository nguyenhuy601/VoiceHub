const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

describe('health', () => {
  it('exposes /health JSON', async () => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.service, 'ai-project-planning-service');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('protects internal run callbacks with internal gateway auth', async () => {
    const previousToken = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.GATEWAY_INTERNAL_TOKEN = 'test-internal-token';
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/internal/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.ok([401, 403].includes(response.status));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      if (previousToken == null) delete process.env.GATEWAY_INTERNAL_TOKEN;
      else process.env.GATEWAY_INTERNAL_TOKEN = previousToken;
    }
  });
});
