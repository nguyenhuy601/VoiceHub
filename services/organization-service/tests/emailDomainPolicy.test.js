const {
  normalizeDomainList,
  extractEmailDomain,
  assertEmailDomainAllowed,
  resolveAllowedEmailDomains,
} = require('../src/utils/emailDomainPolicy');

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('emailDomainPolicy', () => {
  it('allows any email when allowlist empty', () => {
    assert.equal(assertEmailDomainAllowed('a@gmail.com', []).ok, true);
    assert.equal(assertEmailDomainAllowed('a@x.vn', null).ok, true);
  });

  it('rejects domain outside allowlist', () => {
    const r = assertEmailDomainAllowed('user@evil.com', ['voicehub.local', 'gmail.com']);
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'VALIDATION_EMAIL_DOMAIN');
  });

  it('accepts allowed domain case-insensitive', () => {
    const r = assertEmailDomainAllowed('User@Gmail.COM', ['gmail.com']);
    assert.equal(r.ok, true);
  });

  it('resolveAllowedEmailDomains prefers org settings over env', () => {
    const prev = process.env.ORG_ALLOWED_EMAIL_DOMAINS;
    process.env.ORG_ALLOWED_EMAIL_DOMAINS = 'env-only.com';
    try {
      const fromOrg = resolveAllowedEmailDomains({
        settings: { allowedEmailDomains: ['voicehub.local'] },
      });
      assert.deepEqual(fromOrg, ['voicehub.local']);
      const fromEnv = resolveAllowedEmailDomains({ settings: {} });
      assert.deepEqual(fromEnv, ['env-only.com']);
    } finally {
      if (prev == null) delete process.env.ORG_ALLOWED_EMAIL_DOMAINS;
      else process.env.ORG_ALLOWED_EMAIL_DOMAINS = prev;
    }
  });

  it('normalizeDomainList strips @ and empties', () => {
    assert.deepEqual(normalizeDomainList(['@Gmail.com', '', 'vn']), ['gmail.com', 'vn']);
    assert.equal(extractEmailDomain('a@b.co.uk'), 'b.co.uk');
  });
});
