const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  authEmailFromReq,
  withAuthEmailFallback,
} = require('../src/utils/withAuthEmailFallback');

const CALLER_GMAIL = 'nguyenhuy6012004@gmail.com';
const TARGET_EMAIL = 'nv.be.lead@voicehub.local';

function reqWithCallerEmail(email = CALLER_GMAIL) {
  return {
    headers: { 'x-user-email': email },
    user: { email },
  };
}

describe('authEmailFromReq', () => {
  it('reads x-user-email and lowercases', () => {
    assert.equal(authEmailFromReq(reqWithCallerEmail('Admin@Example.COM')), 'admin@example.com');
  });

  it('empty when req is null', () => {
    assert.equal(authEmailFromReq(null), '');
  });
});

describe('withAuthEmailFallback', () => {
  it('keeps payload.email when already set', () => {
    const payload = { displayName: 'Quân', email: TARGET_EMAIL };
    const out = withAuthEmailFallback(reqWithCallerEmail(), payload, null, {
      allowCallerEmail: true,
    });
    assert.equal(out.email, TARGET_EMAIL);
  });

  it('other user empty email + caller header → does not stamp caller Gmail', () => {
    const payload = { displayName: 'Nguyên Huy', email: '' };
    const out = withAuthEmailFallback(reqWithCallerEmail(), payload, null);
    assert.equal(out.email, '');
    assert.notEqual(out.email, CALLER_GMAIL);
  });

  it('other user empty email uses target auth summary, not caller header', () => {
    const payload = { displayName: 'Nhất Nhất', email: '' };
    const out = withAuthEmailFallback(
      reqWithCallerEmail(),
      payload,
      { email: TARGET_EMAIL },
      { allowCallerEmail: false }
    );
    assert.equal(out.email, TARGET_EMAIL);
  });

  it('userId string as authSummary is ignored (not treated as { email })', () => {
    const payload = { displayName: 'Jay Nguyễn', email: '' };
    const out = withAuthEmailFallback(reqWithCallerEmail(), payload, '64abc123def456');
    assert.equal(out.email, '');
  });

  it('self request still falls back to caller x-user-email', () => {
    const payload = { displayName: 'Me', email: '' };
    const out = withAuthEmailFallback(reqWithCallerEmail(), payload, null, {
      allowCallerEmail: true,
    });
    assert.equal(out.email, CALLER_GMAIL);
  });

  it('self prefers target auth email over caller header', () => {
    const payload = { displayName: 'Me', email: '' };
    const out = withAuthEmailFallback(
      reqWithCallerEmail(),
      payload,
      { email: TARGET_EMAIL },
      { allowCallerEmail: true }
    );
    assert.equal(out.email, TARGET_EMAIL);
  });
});
