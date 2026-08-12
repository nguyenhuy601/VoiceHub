/**
 * Unit: isSwaggerEnabled / isSwaggerLiveScanEnabled
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isSwaggerEnabled, isSwaggerLiveScanEnabled } = require('./isSwaggerEnabled');

describe('isSwaggerEnabled', () => {
  it('hard-deny when NODE_ENV=production even if SWAGGER_ENABLED=1', () => {
    assert.equal(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '1' }),
      false
    );
  });

  it('allow production when SWAGGER_ALLOW_IN_PRODUCTION=1', () => {
    assert.equal(
      isSwaggerEnabled({
        NODE_ENV: 'production',
        SWAGGER_ENABLED: '1',
        SWAGGER_ALLOW_IN_PRODUCTION: '1',
      }),
      true
    );
  });

  it('still off in production allow when SWAGGER_ENABLED=0', () => {
    assert.equal(
      isSwaggerEnabled({
        NODE_ENV: 'production',
        SWAGGER_ALLOW_IN_PRODUCTION: '1',
        SWAGGER_ENABLED: '0',
      }),
      false
    );
  });

  it('default on in development', () => {
    assert.equal(isSwaggerEnabled({ NODE_ENV: 'development' }), true);
  });

  it('off when SWAGGER_ENABLED=0 in non-prod', () => {
    assert.equal(
      isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: '0' }),
      false
    );
  });
});

describe('isSwaggerLiveScanEnabled', () => {
  it('requires swagger enabled and LIVE_SCAN flag', () => {
    assert.equal(
      isSwaggerLiveScanEnabled({ NODE_ENV: 'development', SWAGGER_LIVE_SCAN: '1' }),
      true
    );
    assert.equal(
      isSwaggerLiveScanEnabled({ NODE_ENV: 'development', SWAGGER_LIVE_SCAN: '0' }),
      false
    );
    assert.equal(
      isSwaggerLiveScanEnabled({ NODE_ENV: 'production', SWAGGER_LIVE_SCAN: '1' }),
      false
    );
    assert.equal(
      isSwaggerLiveScanEnabled({
        NODE_ENV: 'production',
        SWAGGER_ALLOW_IN_PRODUCTION: '1',
        SWAGGER_LIVE_SCAN: '1',
      }),
      true
    );
  });
});
