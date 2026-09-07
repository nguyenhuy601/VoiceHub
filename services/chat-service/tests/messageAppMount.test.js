const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('chat-service public mount (D1)', () => {
  it('mounts messages only at /api/messages', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    assert.ok(src.includes("app.use('/api/messages', messageRoutes)"));
    assert.equal(src.includes('/api/chat/messages'), false);
  });
});
