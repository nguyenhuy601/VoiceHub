const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('app mount order', () => {
  it('mounts internal before user routes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    const internalIdx = src.indexOf("/api/ai/tasks/internal");
    const userIdx = src.indexOf("app.use('/api/ai/tasks', gatewayUserFromTrustedHeaders");
    assert.ok(internalIdx > 0);
    assert.ok(userIdx > 0);
    assert.ok(internalIdx < userIdx, 'internal must be mounted before parameterized user router');
  });

  it('disables x-powered-by', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    assert.match(src, /disable\('x-powered-by'\)/);
  });
});
