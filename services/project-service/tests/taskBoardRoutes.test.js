const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('taskBoard routes (D4)', () => {
  it('drops dead HTTP aliases', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/taskBoard.routes.js'), 'utf8');
    assert.equal(src.includes("router.post('/cards/:cardId/archive'"), false);
    assert.equal(src.includes("router.put('/:boardId/lists/:listId/watch'"), false);
    assert.equal(src.includes("router.patch('/lists/:listId'"), false);
    assert.ok(src.includes("router.delete('/cards/:cardId'"));
    assert.ok(src.includes("router.post('/:boardId/lists/:listId/watch'"));
  });
});
