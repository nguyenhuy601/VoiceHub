const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('requireProjectAuthorization mount', () => {
  it('project.routes mounts middleware before /:projectId handlers', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/routes/project.routes.js'),
      'utf8'
    );
    const mwIdx = src.indexOf('requireProjectAuthorization');
    const overviewIdx = src.indexOf("router.get('/:projectId/overview'");
    assert.ok(mwIdx > 0, 'middleware import/use missing');
    assert.ok(overviewIdx > mwIdx, 'middleware must run before projectId routes');
    assert.match(src, /router\.use\('\/:projectId',\s*requireProjectAuthorization\)/);
  });
});
