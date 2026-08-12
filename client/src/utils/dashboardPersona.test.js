import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dashPersonaShowsOrgHealth, resolveDashPersona } from './dashboardPersona.js';

describe('resolveDashPersona', () => {
  it('member + leader → manager', () => {
    assert.equal(
      resolveDashPersona({ membershipRole: 'member', structureRole: 'leader', hasOrg: true }),
      'manager'
    );
  });

  it('member + head → manager', () => {
    assert.equal(
      resolveDashPersona({ membershipRole: 'member', structureRole: 'head', hasOrg: true }),
      'manager'
    );
  });

  it('owner + leader vẫn owner', () => {
    assert.equal(
      resolveDashPersona({ membershipRole: 'owner', structureRole: 'leader', hasOrg: true }),
      'owner'
    );
  });

  it('hr không thành manager vì cấu trúc', () => {
    assert.equal(
      resolveDashPersona({ membershipRole: 'hr', structureRole: 'head', hasOrg: true }),
      'hr'
    );
  });

  it('member không cấu trúc → member', () => {
    assert.equal(
      resolveDashPersona({ membershipRole: 'member', structureRole: null, hasOrg: true }),
      'member'
    );
  });

  it('không org → personal', () => {
    assert.equal(resolveDashPersona({ membershipRole: 'member', hasOrg: false }), 'personal');
  });

  it('member + Org Role department_manager → manager', () => {
    assert.equal(
      resolveDashPersona({
        membershipRole: 'member',
        hasOrg: true,
        organizationRoleKeys: ['department_manager'],
      }),
      'manager'
    );
  });

  it('member + Org Role hr_approver → hr', () => {
    assert.equal(
      resolveDashPersona({
        membershipRole: 'member',
        hasOrg: true,
        organizationRoleKeys: [{ roleKey: 'hr_approver' }],
      }),
      'hr'
    );
  });
});

describe('dashPersonaShowsOrgHealth', () => {
  it('manager/owner/admin/hr có board health', () => {
    assert.equal(dashPersonaShowsOrgHealth('manager'), true);
    assert.equal(dashPersonaShowsOrgHealth('member'), false);
  });
});
