const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildActionUrl,
  REMINDER_WINDOW_MS,
} = require('../src/jobs/sprintAutoCompleteReminders.job');

describe('sprintAutoCompleteReminders.job', () => {
  it('buildActionUrl encodes project hub path', () => {
    assert.equal(buildActionUrl(''), '/app/collaborate/projects');
    assert.equal(buildActionUrl('abc123'), '/app/collaborate/projects/abc123');
    assert.equal(
      buildActionUrl('a/b'),
      '/app/collaborate/projects/a%2Fb'
    );
  });

  it('reminder window is 3 days', () => {
    assert.equal(REMINDER_WINDOW_MS, 3 * 24 * 60 * 60 * 1000);
  });
});
