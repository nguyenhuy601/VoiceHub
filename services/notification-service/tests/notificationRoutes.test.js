const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('notification routes (D1)', () => {
  it('lists notifications at GET / only', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/notification.routes.js'), 'utf8');
    assert.ok(src.includes("router.get('/', requireUser"));
    assert.equal(src.includes("/user/:userId"), false);
  });
});
