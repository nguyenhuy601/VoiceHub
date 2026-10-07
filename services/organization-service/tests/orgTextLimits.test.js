const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ORG_TEXT_LIMITS, assertTextLimits, assertHttpUrl } = require('../src/utils/orgTextLimits');

describe('orgTextLimits', () => {
  it('accepts values at the limit and ignores undefined/null', () => {
    assertTextLimits({
      name: 'a'.repeat(ORG_TEXT_LIMITS.name),
      description: 'b'.repeat(ORG_TEXT_LIMITS.description),
      code: undefined,
      logo: null,
    });
  });

  it('rejects over-limit text with ORG_TEXT_TOO_LONG', () => {
    assert.throws(
      () => assertTextLimits({ name: 'a'.repeat(ORG_TEXT_LIMITS.name + 1) }),
      (err) => err.statusCode === 400 && err.errorCode === 'ORG_TEXT_TOO_LONG'
    );
    assert.throws(
      () => assertTextLimits({ code: 'c'.repeat(ORG_TEXT_LIMITS.code + 1) }),
      (err) => err.errorCode === 'ORG_TEXT_TOO_LONG'
    );
  });

  it('rejects non-string values', () => {
    assert.throws(
      () => assertTextLimits({ name: { $gt: '' } }),
      (err) => err.statusCode === 400 && err.errorCode === 'ORG_VALIDATION_FAILED'
    );
  });

  it('assertHttpUrl allows empty and http(s), rejects other schemes', () => {
    assertHttpUrl('');
    assertHttpUrl(undefined);
    assertHttpUrl('https://cdn.example.com/logo.png');
    assertHttpUrl('http://voicehub.local/a.png');
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'not a url', 'ftp://x/y']) {
      assert.throws(() => assertHttpUrl(bad), (err) => err.errorCode === 'ORG_INVALID_URL');
    }
    assert.throws(
      () => assertHttpUrl(`https://x.com/${'a'.repeat(ORG_TEXT_LIMITS.logo)}`),
      (err) => err.errorCode === 'ORG_TEXT_TOO_LONG'
    );
  });
});
