const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('project-service public mount (D1)', () => {
  it('does not mount /api/work alias', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    assert.ok(src.includes("app.use('/api/tasks', taskRoutes)"));
    assert.ok(src.includes("app.use('/api/tasks/boards', taskBoardRoutes)"));
    assert.equal(src.includes("app.use('/api/work'"), false);
    assert.equal(src.includes("app.use('/api/work/boards'"), false);
  });
});
