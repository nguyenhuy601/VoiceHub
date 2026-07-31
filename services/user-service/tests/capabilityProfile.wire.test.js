const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveCapabilityIntent,
  applyCapabilityAction,
  toPublicVerifiedCapability,
  emptyCapability,
} = require('../src/services/capabilityProfile.service');

describe('resolveCapabilityIntent (API wire)', () => {
  it('returns null when no capability fields', () => {
    assert.equal(resolveCapabilityIntent({ displayName: 'A' }, 'self'), null);
  });

  it('defaults save_draft when self sends capability object only', () => {
    const intent = resolveCapabilityIntent(
      { capability: { primaryDomain: 'be' } },
      'self'
    );
    assert.equal(intent.action, 'save_draft');
    assert.equal(intent.fields.primaryDomain, 'be');
  });

  it('forbids verify on self mode', () => {
    assert.throws(
      () => resolveCapabilityIntent({ capabilityAction: 'verify' }, 'self'),
      (err) => err.errorCode === 'CAPABILITY_ACTION_FORBIDDEN' && err.statusCode === 403
    );
  });

  it('forbids submit on admin mode', () => {
    assert.throws(
      () =>
        resolveCapabilityIntent(
          { capabilityAction: 'submit', capability: { primaryDomain: 'be' } },
          'admin'
        ),
      (err) => err.errorCode === 'CAPABILITY_ACTION_FORBIDDEN'
    );
  });

  it('allows admin verify / reject', () => {
    assert.equal(resolveCapabilityIntent({ capabilityAction: 'verify' }, 'admin').action, 'verify');
    assert.equal(
      resolveCapabilityIntent(
        { capabilityAction: 'reject', rejectReason: 'x' },
        'admin'
      ).action,
      'reject'
    );
  });
});

describe('assertHrOnlyCapabilityReview (1)+(a)', () => {
  const {
    assertHrOnlyCapabilityReview,
  } = require('../src/services/capabilityProfile.service');

  it('allows hr to verify and reject', () => {
    assert.equal(assertHrOnlyCapabilityReview('hr', 'verify').ok, true);
    assert.equal(assertHrOnlyCapabilityReview('hr', 'reject').ok, true);
  });

  it('blocks owner and admin on verify/reject', () => {
    for (const level of ['owner', 'admin', '']) {
      const r = assertHrOnlyCapabilityReview(level, 'verify');
      assert.equal(r.ok, false);
      assert.equal(r.errorCode, 'CAPABILITY_HR_ONLY');
      assert.equal(r.statusCode, 403);
    }
  });

  it('does not block non-capability admin patches', () => {
    assert.equal(assertHrOnlyCapabilityReview('owner', '').ok, true);
    assert.equal(assertHrOnlyCapabilityReview('admin', 'save_draft').ok, true);
  });
});

describe('visibility shape (public vs full)', () => {
  it('other members only see verified capability', () => {
    const pending = {
      ...emptyCapability(),
      positionCode: 'dev',
      primaryDomain: 'be',
      yearsExperience: 2,
      skills: [{ name: 'React', level: 3 }],
      verificationStatus: 'pending_hr',
    };
    assert.equal(toPublicVerifiedCapability(pending), null);

    const verified = applyCapabilityAction(pending, 'verify', {
      actorUserId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    assert.equal(verified.ok, true);
    const pub = toPublicVerifiedCapability(verified.capability);
    assert.equal(pub.verificationStatus, 'verified');
    assert.equal(pub.positionCode, 'dev');
  });
});
