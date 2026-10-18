import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideAdminRoute } from './adminRouteAccess.js';
import { isProjectMembershipDenied, routeDeniedMessage } from './routeDeniedNotice.js';

const ENTRIES = [
  { path: '/app/admin/users', requiredGrant: 'organization.employee.view', end: true },
  { path: '/app/admin/system-config/policy', requiredGrant: 'organization.policy.update' },
  { path: '/app/admin/audit', requiredGrant: 'system.audit.view' },
  { path: '/app/admin/backup', adminOnly: true },
  {
    path: '/app/admin/rbac/project-roles',
    requiredGrant: 'organization.master_data.view',
    adminOnly: true,
  },
];

function grantsOf(map) {
  return {
    hasGrant: (key) => Object.prototype.hasOwnProperty.call(map, key),
    scopeOf: (key) => map[key] || null,
  };
}

describe('decideAdminRoute', () => {
  it('SELF employee.view leaves admin', () => {
    const ctx = grantsOf({ 'organization.employee.view': 'SELF' });
    assert.equal(decideAdminRoute({ pathname: '/app/admin', entries: ENTRIES, ...ctx }).action, 'redirect-work');
    assert.equal(
      decideAdminRoute({ pathname: '/app/admin/rbac/project-roles', entries: ENTRIES, ...ctx }).action,
      'redirect-work'
    );
  });

  it('DEPARTMENT with a view grant skips a policy URL', () => {
    const ctx = grantsOf({
      'organization.employee.view': 'DEPARTMENT',
      'organization.department.view': 'DEPARTMENT',
    });
    const decision = decideAdminRoute({
      pathname: '/app/admin/system-config/policy',
      entries: ENTRIES,
      ...ctx,
    });
    assert.equal(decision.action, 'redirect-first-allowed');
    assert.equal(decision.path, '/app/admin/users');
    assert.equal(
      decideAdminRoute({ pathname: '/app/admin/users', entries: ENTRIES, ...ctx }).action,
      'enter'
    );
  });

  it('ORGANIZATION policy.update enters the policy URL', () => {
    const ctx = grantsOf({ 'organization.policy.update': 'ORGANIZATION' });
    assert.equal(
      decideAdminRoute({ pathname: '/app/admin/system-config/policy', entries: ENTRIES, ...ctx }).action,
      'enter'
    );
  });

  it('policy.update opens the config hub when the policy path is only a legacy URL', () => {
    const liveEntries = [
      { path: '/app/admin/users', requiredGrant: 'organization.employee.view', end: true },
      {
        path: '/app/admin/system-config',
        requiredGrant: 'organization.policy.view',
        adminOnly: true,
        end: true,
      },
    ];
    const ctx = grantsOf({
      'organization.employee.view': 'ORGANIZATION',
      'organization.policy.update': 'ORGANIZATION',
    });
    const decision = decideAdminRoute({
      pathname: '/app/admin/system-config/policy',
      entries: liveEntries,
      ...ctx,
    });
    assert.equal(decision.action, 'redirect-first-allowed');
    assert.equal(decision.path, '/app/admin/system-config');
    assert.equal(
      decideAdminRoute({ pathname: '/app/admin/system-config', entries: liveEntries, ...ctx }).action,
      'enter'
    );
  });

  it('system admin enters the project-role catalog and the backup runbook', () => {
    const ctx = grantsOf({});
    assert.equal(
      decideAdminRoute({
        pathname: '/app/admin/rbac/project-roles',
        entries: ENTRIES,
        isSystemAdmin: true,
        ...ctx,
      }).action,
      'enter'
    );
    assert.equal(
      decideAdminRoute({
        pathname: '/app/admin/backup',
        entries: ENTRIES,
        isSystemAdmin: true,
        ...ctx,
      }).action,
      'enter'
    );
  });

  it('system admin does not enter policy or the company audit log', () => {
    const ctx = grantsOf({});
    const policy = decideAdminRoute({
      pathname: '/app/admin/system-config/policy',
      entries: ENTRIES,
      isSystemAdmin: true,
      ...ctx,
    });
    assert.notEqual(policy.action, 'enter');
    assert.equal(policy.action, 'redirect-first-allowed');
    assert.equal(policy.path, '/app/admin/users');
    const audit = decideAdminRoute({
      pathname: '/app/admin/audit',
      entries: ENTRIES,
      isSystemAdmin: true,
      ...ctx,
    });
    assert.notEqual(audit.action, 'enter');
  });
});

describe('project membership denial', () => {
  it('403 and 404 leave the project; 500 stays', () => {
    assert.equal(isProjectMembershipDenied({ response: { status: 403 } }), true);
    assert.equal(isProjectMembershipDenied({ status: 404 }), true);
    assert.equal(isProjectMembershipDenied({ response: { status: 500 } }), false);
    assert.equal(isProjectMembershipDenied(new Error('network')), false);
  });

  it('notice copy is fixed', () => {
    assert.equal(routeDeniedMessage('admin'), 'Bạn không có quyền vào trang quản trị.');
    assert.equal(routeDeniedMessage('project'), 'Bạn không có quyền mở trang này.');
  });
});
