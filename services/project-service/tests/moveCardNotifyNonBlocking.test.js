const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('moveTaskCard notify/history non-blocking', () => {
  it('does not await notifyListWatchers or appendFieldChanges in moveTaskCard', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/taskBoard.service.js'),
      'utf8'
    );
    const start = src.indexOf('async function moveTaskCard');
    assert.ok(start >= 0, 'moveTaskCard not found');
    const end = src.indexOf('async function updateCard', start);
    assert.ok(end > start, 'updateCard after moveTaskCard not found');
    const body = src.slice(start, end);

    assert.equal(
      /await\s+notifyListWatchers\s*\(/.test(body),
      false,
      'moveTaskCard must not await notifyListWatchers'
    );
    assert.equal(
      /await\s+appendFieldChanges\s*\(/.test(body),
      false,
      'moveTaskCard must not await appendFieldChanges'
    );
    assert.ok(
      /void\s+notifyListWatchers\s*\(/.test(body),
      'moveTaskCard should fire-and-forget notifyListWatchers'
    );
    assert.ok(
      /void\s+appendFieldChanges\s*\(/.test(body),
      'moveTaskCard should fire-and-forget appendFieldChanges'
    );
  });
});
