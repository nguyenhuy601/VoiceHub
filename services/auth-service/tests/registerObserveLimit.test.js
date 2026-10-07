const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertRegisterObserveAllowed,
  registerObserveConfig,
} = require('../src/utils/registerObserveLimit');

describe('assertRegisterObserveAllowed', () => {
  it('failOpen throws 503 before the caller can create a user', async () => {
    let created = 0;
    await assert.rejects(
      async () => {
        await assertRegisterObserveAllowed({
          checkRateLimit: async () => ({ allowed: true, remaining: 300, failOpen: true }),
        });
        created += 1;
      },
      (err) => err.statusCode === 503 && err.errorCode === 'LIMITER_UNAVAILABLE'
    );
    assert.equal(created, 0);
  });

  it('counted over the observe ceiling is 429', async () => {
    const prev = process.env.ORG_REGISTER_OBSERVE_LIMIT;
    delete process.env.ORG_REGISTER_OBSERVE_LIMIT;
    try {
      const cfg = registerObserveConfig();
      assert.equal(cfg.limit, 300);
      assert.equal(cfg.windowSec, 60);
      await assert.rejects(
        () =>
          assertRegisterObserveAllowed({
            checkRateLimit: async (opts) => {
              assert.equal(opts.limit, 300);
              assert.equal(opts.key, 'auth:register:observe');
              return { allowed: false, remaining: 0 };
            },
          }),
        (err) => err.statusCode === 429 && err.errorCode === 'AUTH_RATE_LIMITED'
      );
    } finally {
      if (prev === undefined) delete process.env.ORG_REGISTER_OBSERVE_LIMIT;
      else process.env.ORG_REGISTER_OBSERVE_LIMIT = prev;
    }
  });

  it('allowed register does not throw', async () => {
    await assertRegisterObserveAllowed({
      checkRateLimit: async () => ({ allowed: true, remaining: 299 }),
    });
  });
});

describe('register source contract', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/controllers/auth.controller.js'),
    'utf8'
  );

  it('observe limiter runs before authService.register', () => {
    const gate = src.indexOf('assertRegisterObserveAllowed');
    const create = src.indexOf('authService.register(');
    assert.ok(gate >= 0 && create > gate);
  });
});
