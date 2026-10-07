const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeSearchQuery,
  SEARCH_QUERY_MAX_LEN,
} = require('../src/utils/searchQuerySafe');

describe('sanitizeSearchQuery', () => {
  it('escapes regex metacharacters', () => {
    const { escaped, raw } = sanitizeSearchQuery('(a+)+$');
    assert.equal(raw, '(a+)+$');
    assert.equal(escaped, '\\(a\\+\\)\\+\\$');
    assert.doesNotThrow(() => new RegExp(escaped, 'i'));
  });

  it('caps length', () => {
    const long = 'x'.repeat(SEARCH_QUERY_MAX_LEN + 40);
    const { raw } = sanitizeSearchQuery(long);
    assert.equal(raw.length, SEARCH_QUERY_MAX_LEN);
  });

  it('trims empty', () => {
    const { raw, escaped } = sanitizeSearchQuery('   ');
    assert.equal(raw, '');
    assert.equal(escaped, '');
  });
});
