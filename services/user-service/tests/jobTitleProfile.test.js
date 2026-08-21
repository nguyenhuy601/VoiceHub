const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { coalesceJobTitle, normalizeJobTitleForSave } = require('../src/utils/jobTitleProfile');

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
      preferences: { jobTitle: 'New Title' },
    });
    assert.equal(title, 'New Title');
  });

  it('thiếu prefs.jobTitle fallback top-level', () => {
    const title = coalesceJobTitle({
      jobTitle: 'Frontend Developer',
      preferences: { theme: 'dark' },
    });
    assert.equal(title, 'Frontend Developer');
  });

  it('không có title trả chuỗi rỗng', () => {
    assert.equal(coalesceJobTitle({}), '');
    assert.equal(coalesceJobTitle(null), '');
  });
});

describe('normalizeJobTitleForSave', () => {
  it('trim và giới hạn 120 ký tự', () => {
    assert.equal(normalizeJobTitleForSave('  Dev  '), 'Dev');
    assert.equal(normalizeJobTitleForSave(null), '');
    assert.equal(normalizeJobTitleForSave('x'.repeat(150)).length, 120);
  });
});
