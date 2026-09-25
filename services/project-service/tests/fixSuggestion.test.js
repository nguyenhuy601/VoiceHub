const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPendingFixSuggestion,
  decideFixSuggestion,
} = require('../src/utils/task/fixSuggestion');

describe('fix suggestion state machine', () => {
  it('creates a pending suggestion', () => {
    const now = new Date('2026-09-18T00:00:00.000Z');
    const suggestion = buildPendingFixSuggestion({
      text: '  Add a null guard  ',
      userId: 'user-1',
      now,
    });
    assert.equal(suggestion.status, 'pending');
    assert.equal(suggestion.text, 'Add a null guard');
    assert.equal(suggestion.proposedBy, 'user-1');
    assert.equal(suggestion.proposedAt, now);
  });

  it('accepts or rejects only a pending suggestion', () => {
    const pending = buildPendingFixSuggestion({ text: 'Fix it', userId: 'user-1' });
    assert.equal(
      decideFixSuggestion(pending, { decision: 'accept', userId: 'user-2' }).status,
      'accepted'
    );
    assert.equal(
      decideFixSuggestion(pending, { decision: 'reject', userId: 'user-2' }).status,
      'rejected'
    );
    assert.throws(
      () =>
        decideFixSuggestion(
          { ...pending, status: 'accepted' },
          { decision: 'reject', userId: 'user-2' }
        ),
      (err) => err.statusCode === 409
    );
  });

  it('rejects an invalid decision', () => {
    const pending = buildPendingFixSuggestion({ text: 'Fix it', userId: 'user-1' });
    assert.throws(
      () => decideFixSuggestion(pending, { decision: 'merge', userId: 'user-2' }),
      (err) => err.statusCode === 400
    );
  });
});
