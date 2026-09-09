const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('openapi.bundle.json dual-path cleanup', () => {
  const spec = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/swagger/openapi.bundle.json'), 'utf8')
  );
  const keys = Object.keys(spec.paths || {});

  it('D0: no REST /admin path keys', () => {
    const admin = keys.filter((k) => k.includes('/admin/'));
    assert.deepEqual(admin, []);
  });

  it('D1: no /api/work or /api/chat path keys', () => {
    assert.equal(
      keys.some((k) => k === '/api/work' || k.startsWith('/api/work/')),
      false
    );
    assert.equal(
      keys.some((k) => k === '/api/chat' || k.startsWith('/api/chat/')),
      false
    );
  });
});
