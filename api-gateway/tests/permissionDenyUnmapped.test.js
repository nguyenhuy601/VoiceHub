const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDenyUnmapped } = require('../src/middlewares/permissionDenyUnmapped');

describe('resolveDenyUnmapped', () => {
  it('forces true in production even if env says false', () => {
    assert.equal(
      resolveDenyUnmapped({ NODE_ENV: 'production', PERMISSION_DENY_UNMAPPED: 'false' }),
      true
    );
  });

  it('honors false outside production', () => {
    assert.equal(
      resolveDenyUnmapped({ NODE_ENV: 'development', PERMISSION_DENY_UNMAPPED: 'false' }),
      false
    );
  });
});
