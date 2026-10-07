const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { resolveInviteLinkSecret } = require('../src/utils/inviteLinkSecret');

describe('resolveInviteLinkSecret (Sec-Y2b)', () => {
  it('returns the dedicated invite secret', () => {
    assert.equal(
      resolveInviteLinkSecret({ INVITE_LINK_SECRET: ' invite-secret ', JWT_SECRET: 'jwt-secret' }),
      'invite-secret'
    );
  });

  it('does not fall back to JWT_SECRET when the invite secret is missing', () => {
    assert.equal(resolveInviteLinkSecret({ JWT_SECRET: 'jwt-secret' }), '');
    assert.equal(resolveInviteLinkSecret({ INVITE_LINK_SECRET: '   ', JWT_SECRET: 'jwt-secret' }), '');
  });

  it('rejects an invite secret identical to JWT_SECRET', () => {
    assert.equal(resolveInviteLinkSecret({ INVITE_LINK_SECRET: 'same', JWT_SECRET: 'same' }), '');
  });

  it('accepts the invite secret when JWT_SECRET is absent', () => {
    assert.equal(resolveInviteLinkSecret({ INVITE_LINK_SECRET: 'invite-secret' }), 'invite-secret');
  });

  it('memberController no longer reads JWT_SECRET for invite links', () => {
    const src = readFileSync(join(__dirname, '../src/controllers/memberController.js'), 'utf8');
    const line = src.split('\n').find((l) => l.includes('const INVITE_LINK_SECRET'));
    assert.ok(line, 'INVITE_LINK_SECRET declaration missing');
    assert.match(line, /resolveInviteLinkSecret\(\)/);
    assert.equal(src.includes('process.env.JWT_SECRET'), false);
  });
});
