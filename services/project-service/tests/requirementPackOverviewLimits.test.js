const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { clampOverviewForPack } = require('../src/utils/requirement/requirementOverviewClamp');

describe('clampOverviewForPack', () => {
  it('truncates expectedUsers to 512', () => {
    const long = `Students, Academic Affairs staff — ${'x'.repeat(500)}`;
    assert.ok(long.length > 512);
    const out = clampOverviewForPack({ expectedUsers: long });
    assert.equal(out.expectedUsers.length, 512);
    assert.ok(out.expectedUsers.startsWith('Students'));
  });

  it('preserves platform array and other fields', () => {
    const out = clampOverviewForPack({
      expectedUsers: 'A'.repeat(600),
      platform: ['Web', 'Mobile'],
      budget: 1000,
    });
    assert.deepEqual(out.platform, ['Web', 'Mobile']);
    assert.equal(out.budget, 1000);
    assert.equal(out.expectedUsers.length, 512);
  });
});
