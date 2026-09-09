process.env.ROLE_PERMISSION_SERVICE_URL = 'http://role-permission-service:3000';
process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthorizeOrGrant } = require('../src/utils/authorizeOrGrantDecision');

const ROLES = ['owner', 'admin'];

describe('resolveAuthorizeOrGrant', () => {
  it('owner pass without grant', () => {
    const r = resolveAuthorizeOrGrant({
      membership: { role: 'owner' },
      normalizedRole: 'owner',
      roles: ROLES,
      grantAllowed: false,
    });
    assert.equal(r.allow, true);
    assert.equal(r.via, 'membership');
  });

  it('member + grant pass', () => {
    const r = resolveAuthorizeOrGrant({
      membership: { role: 'member' },
      normalizedRole: 'member',
      roles: ROLES,
      grantAllowed: true,
    });
    assert.equal(r.allow, true);
    assert.equal(r.via, 'grant');
  });

  it('member without grant deny', () => {
    const r = resolveAuthorizeOrGrant({
      membership: { role: 'member' },
      normalizedRole: 'member',
      roles: ROLES,
      grantAllowed: false,
    });
    assert.equal(r.allow, false);
  });

  it('no membership deny even with grant when orgAccessOk is false', () => {
    const r = resolveAuthorizeOrGrant({
      membership: null,
      normalizedRole: null,
      roles: ROLES,
      grantAllowed: true,
    });
    assert.equal(r.allow, false);
  });

  it('roles-only org access + grant pass', () => {
    const r = resolveAuthorizeOrGrant({
      membership: null,
      normalizedRole: null,
      roles: ROLES,
      grantAllowed: true,
      orgAccessOk: true,
    });
    assert.equal(r.allow, true);
    assert.equal(r.via, 'grant');
  });

  it('grant-only: member + grant pass', () => {
    const r = resolveAuthorizeOrGrant({
      membership: { role: 'member' },
      normalizedRole: 'member',
      roles: [],
      grantAllowed: true,
      orgAccessOk: true,
    });
    assert.equal(r.allow, true);
    assert.equal(r.via, 'grant');
  });

  it('grant-only: owner without grant deny', () => {
    const r = resolveAuthorizeOrGrant({
      membership: { role: 'owner' },
      normalizedRole: 'owner',
      roles: [],
      grantAllowed: false,
      orgAccessOk: true,
    });
    assert.equal(r.allow, false);
  });
});
