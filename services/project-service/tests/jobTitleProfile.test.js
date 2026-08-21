const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { coalesceJobTitle } = require('../src/utils/jobTitleProfile');

describe('coalesceJobTitle', () => {
  it('prefs.jobTitle rỗng thắng top-level title', () => {
    const title = coalesceJobTitle({
      jobTitle: 'Frontend Developer',
      preferences: { jobTitle: '' },
    });
    assert.equal(title, '');
  });

  it('prefs.jobTitle có giá trị dùng prefs', () => {
    const title = coalesceJobTitle({
      jobTitle: 'Old Title',
      preferences: { jobTitle: 'Business Analyst' },
    });
    assert.equal(title, 'Business Analyst');
  });

  it('thiếu prefs.jobTitle fallback top-level', () => {
    const title = coalesceJobTitle({
      jobTitle: 'Frontend Developer',
      preferences: { theme: 'dark' },
    });
    assert.equal(title, 'Frontend Developer');
  });
});
