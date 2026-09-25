/**
 * invokeTool timeout + retry (RULE-INV-01)
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  clearRegistry,
  registerTool,
  invokeTool,
} = require('../src/registry/toolRegistry');

describe('invokeTool timeout/retry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('throws TOOL_TIMEOUT when execute exceeds timeout', async () => {
    registerTool({
      toolName: 'SlowTool',
      allowedContexts: ['planning'],
      requires: [],
      timeout: 30,
      retryPolicy: { maxRetries: 0 },
      execute: async () => {
        await new Promise((r) => setTimeout(r, 80));
        return { ok: true };
      },
    });
    await assert.rejects(
      () => invokeTool('SlowTool', {}, { contextName: 'planning' }),
      (err) => err.code === 'TOOL_TIMEOUT'
    );
  });

  it('retries then succeeds within maxRetries', async () => {
    let calls = 0;
    registerTool({
      toolName: 'FlakyTool',
      allowedContexts: ['planning'],
      requires: [],
      timeout: 5_000,
      retryPolicy: { maxRetries: 2 },
      execute: async () => {
        calls += 1;
        if (calls < 3) {
          const err = new Error('transient');
          err.code = 'TRANSIENT';
          throw err;
        }
        return { ok: true, calls };
      },
    });
    const out = await invokeTool('FlakyTool', {}, { contextName: 'planning' });
    assert.equal(out.ok, true);
    assert.equal(calls, 3);
  });
});
