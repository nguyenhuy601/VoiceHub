const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('friend routes (D1/D2)', () => {
  it('uses canonical action paths only', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/friend.routes.js'), 'utf8');
    assert.equal(src.includes('/user/:userId'), false);
    assert.equal(src.includes("router.get('/requests'"), false);
    assert.equal(src.includes("router.post('/accept/:id'"), false);
    assert.equal(src.includes("router.delete('/reject/:id'"), false);
    assert.equal(src.includes("router.post('/block'"), false);
    assert.equal(src.includes("router.delete('/unblock/:userId'"), false);
    assert.equal(src.includes('friendControllerLegacy'), false);
    assert.ok(src.includes("router.get('/pending'"));
    assert.ok(src.includes("router.post('/:friendId/accept'"));
    assert.ok(src.includes("router.post('/:friendId/block'"));
    assert.ok(src.includes("router.post('/:friendId/unblock'"));
  });
});
