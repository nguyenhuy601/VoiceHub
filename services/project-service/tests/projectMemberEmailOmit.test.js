const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  omitMemberEmails,
  canSeeMemberEmails,
} = require('../src/utils/project/projectMemberEmailOmit');

describe('omitMemberEmails', () => {
  it('strips top-level and nested user.email', () => {
    const out = omitMemberEmails({
      userId: 'u1',
      email: 'a@example.com',
      displayName: 'A',
      user: {
        _id: 'u1',
        email: 'a@example.com',
        displayName: 'A',
      },
    });
    assert.equal(out.email, undefined);
    assert.equal(out.user.email, undefined);
    assert.equal(out.displayName, 'A');
    assert.equal(out.user.displayName, 'A');
  });

  it('maps arrays', () => {
    const out = omitMemberEmails([
      { email: 'a@x.com', user: { email: 'a@x.com' } },
      { email: 'b@x.com' },
    ]);
    assert.equal(out[0].email, undefined);
    assert.equal(out[0].user.email, undefined);
    assert.equal(out[1].email, undefined);
  });
});

describe('canSeeMemberEmails', () => {
  it('allows creator and canAdminProject', () => {
    assert.equal(
      canSeeMemberEmails({
        userId: 'u1',
        project: { createdBy: 'u1' },
      }),
      true
    );
    assert.equal(
      canSeeMemberEmails({
        userId: 'u2',
        project: { createdBy: 'u1' },
        canAdminProject: true,
      }),
      true
    );
  });

  it('allows org owner/admin membershipRole', () => {
    assert.equal(
      canSeeMemberEmails({
        userId: 'u2',
        project: { createdBy: 'u1' },
        membershipRole: 'owner',
      }),
      true
    );
    assert.equal(
      canSeeMemberEmails({
        userId: 'u2',
        project: { createdBy: 'u1' },
        membershipRole: 'admin',
      }),
      true
    );
  });

  it('denies regular member', () => {
    assert.equal(
      canSeeMemberEmails({
        userId: 'u2',
        project: { createdBy: 'u1' },
        membershipRole: 'member',
        canAdminProject: false,
      }),
      false
    );
  });
});
