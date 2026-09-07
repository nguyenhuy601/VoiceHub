const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('aiTask routes (C1)', () => {
  it('delegates handlers to controller without inline async (req, res)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/aiTask.routes.js'), 'utf8');
    assert.equal(/async\s*\(\s*req\s*,\s*res\s*\)/.test(src), false);
    assert.ok(src.includes("router.post('/extract'"));
    assert.ok(src.includes("controller.postExtract"));
  });
});
