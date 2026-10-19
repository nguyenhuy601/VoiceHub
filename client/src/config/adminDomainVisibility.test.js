import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getVisibleAdminDomains } from './adminDomainsConfig.js';
import {
  firstAllowedAdminLeafPath,
  hasAnyAdminNavGrant,
  listAdminDomainsForActor,
  listAllowedAdminLeafIds,
  RBAC_GRANT,
} from './rbacUiGrantMap.js';

function grantsOf(map) {
  const normalized = {};
  for (const [k, v] of Object.entries(map || {})) {
    normalized[String(k).toLowerCase()] = v;
  }
  return {
    hasGrant: (key) => Object.prototype.hasOwnProperty.call(normalized, String(key || '').toLowerCase()),
    scopeOf: (key) => normalized[String(key || '').toLowerCase()] || null,
  };
}

function domainIds(domains) {
  return domains.map((d) => d.id).sort();
}

function domainById(domains, id) {
  return domains.find((d) => d.id === id);
}

const CATALOG = getVisibleAdminDomains();

describe('listAdminDomainsForActor (§10 ban-giao)', () => {
  it('Bên bán (systemAdmin): maintain domains + security sessions; không audit/voice/reports/chat', () => {
    const ctx = { ...grantsOf({}), isSystemAdmin: true };
    const domains = listAdminDomainsForActor(CATALOG, ctx);
    const ids = domainIds(domains);
    assert.ok(ids.includes('users'));
    assert.ok(ids.includes('accounts'));
    assert.ok(ids.includes('org-structure'));
    assert.ok(ids.includes('rbac'));
    assert.ok(ids.includes('security'));
    assert.equal(ids.includes('audit'), false);
    assert.equal(ids.includes('voice'), false);
    assert.equal(ids.includes('reports'), false);
    assert.equal(ids.includes('chat'), false);
    assert.equal(ids.includes('projects'), false);
    assert.equal(ids.includes('files'), false);
    assert.equal(ids.includes('notifications'), false);

    const securityLeaves = listAllowedAdminLeafIds(domainById(domains, 'security'), ctx);
    assert.ok(securityLeaves.includes('sessions-hub'));
    assert.equal(securityLeaves.includes('settings-hub'), false);

    const usersLeaves = listAllowedAdminLeafIds(domainById(domains, 'users'), ctx);
    assert.ok(usersLeaves.includes('list'));
    assert.equal(usersLeaves.includes('import'), false);

    const orgLeaves = listAllowedAdminLeafIds(domainById(domains, 'org-structure'), ctx);
    assert.ok(orgLeaves.includes('backup'));
    assert.ok(orgLeaves.includes('levels') || orgLeaves.includes('unit-tree'));

    const rbacLeaves = listAllowedAdminLeafIds(domainById(domains, 'rbac'), ctx);
    assert.ok(rbacLeaves.some((id) => String(id).startsWith('project-role-')));

    assert.equal(firstAllowedAdminLeafPath(domainById(domains, 'users'), ctx), '/app/admin/users');
  });

  it('Giám đốc: có audit + security sessions + projects (policy); không voice-only', () => {
    const ctx = {
      ...grantsOf({
        [RBAC_GRANT.EMPLOYEE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.STRUCTURE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.DEPT_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.DEPT_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.TEAM_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.TEAM_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.ORG_ROLE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.ORG_ROLE_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.POSITION_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.POSITION_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.POLICY_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.POLICY_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.AUDIT_VIEW]: 'ORGANIZATION',
      }),
      isSystemAdmin: false,
    };
    const domains = listAdminDomainsForActor(CATALOG, ctx);
    const ids = domainIds(domains);
    assert.ok(ids.includes('users'));
    assert.ok(ids.includes('audit'));
    assert.ok(ids.includes('security'));
    assert.ok(ids.includes('projects'));
    assert.ok(ids.includes('rbac'));
    assert.equal(ids.includes('voice'), false);

    const securityLeaves = listAllowedAdminLeafIds(domainById(domains, 'security'), ctx);
    assert.ok(securityLeaves.includes('sessions-hub'));
    assert.ok(securityLeaves.includes('settings-hub'));

    const auditPath = firstAllowedAdminLeafPath(domainById(domains, 'audit'), ctx);
    assert.equal(auditPath, '/app/admin/audit');

    const rbacLeaves = listAllowedAdminLeafIds(domainById(domains, 'rbac'), ctx);
    assert.equal(rbacLeaves.some((id) => String(id).startsWith('project-role-')), false);
  });

  it('Nhân sự (HR): users (import) / accounts / org dept / rbac pos-assign; không audit/policy/projects', () => {
    const ctx = {
      ...grantsOf({
        [RBAC_GRANT.EMPLOYEE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_INVITE]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_DISABLE]: 'ORGANIZATION',
        [RBAC_GRANT.DEPT_VIEW]: 'ORGANIZATION',
      }),
      isSystemAdmin: false,
    };
    const domains = listAdminDomainsForActor(CATALOG, ctx);
    const ids = domainIds(domains);
    assert.ok(ids.includes('users'));
    assert.ok(ids.includes('accounts'));
    assert.ok(ids.includes('org-structure'));
    assert.ok(ids.includes('rbac'));
    assert.equal(ids.includes('audit'), false);
    assert.equal(ids.includes('projects'), false);
    // employee.view → sessions-hub (không policy settings)
    assert.ok(ids.includes('security'));
    const securityLeavesHr = listAllowedAdminLeafIds(domainById(domains, 'security'), ctx);
    assert.ok(securityLeavesHr.includes('sessions-hub'));
    assert.equal(securityLeavesHr.includes('settings-hub'), false);

    const usersLeaves = listAllowedAdminLeafIds(domainById(domains, 'users'), ctx);
    assert.ok(usersLeaves.includes('import'));
    assert.ok(usersLeaves.includes('list'));

    const accountsLeaves = listAllowedAdminLeafIds(domainById(domains, 'accounts'), ctx);
    assert.ok(accountsLeaves.includes('access-hub') || accountsLeaves.includes('verification-hub'));

    const rbacLeaves = listAllowedAdminLeafIds(domainById(domains, 'rbac'), ctx);
    assert.deepEqual(rbacLeaves, ['pos-assign']);

    const orgLeaves = listAllowedAdminLeafIds(domainById(domains, 'org-structure'), ctx);
    assert.ok(orgLeaves.some((id) => String(id).startsWith('dept-')));

    assert.equal(firstAllowedAdminLeafPath(domainById(domains, 'users'), ctx), '/app/admin/users');
    assert.ok(hasAnyAdminNavGrant(ctx.hasGrant, ctx.scopeOf, CATALOG));
  });

  it('Kiểm toán: view audit + structure; không mutate invite', () => {
    const ctx = {
      ...grantsOf({
        [RBAC_GRANT.EMPLOYEE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.STRUCTURE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.DEPT_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.TEAM_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.ORG_ROLE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.POSITION_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.POLICY_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.AUDIT_VIEW]: 'ORGANIZATION',
      }),
      isSystemAdmin: false,
    };
    const ids = domainIds(listAdminDomainsForActor(CATALOG, ctx));
    assert.ok(ids.includes('audit'));
    assert.ok(ids.includes('users'));
    assert.ok(ids.includes('rbac'));
    assert.equal(ids.includes('voice'), false);
  });

  it('Thành viên có họp: voice (+ chat/files/notif nếu grant); không users company', () => {
    const ctx = {
      ...grantsOf({
        [RBAC_GRANT.MEETING_VIEW]: 'DEPARTMENT',
        [RBAC_GRANT.CHAT_VIEW]: 'DEPARTMENT',
        [RBAC_GRANT.FILE_DOWNLOAD]: 'DEPARTMENT',
        [RBAC_GRANT.NOTIF_VIEW]: 'DEPARTMENT',
      }),
      isSystemAdmin: false,
    };
    const ids = domainIds(listAdminDomainsForActor(CATALOG, ctx));
    assert.ok(ids.includes('voice'));
    assert.ok(ids.includes('chat'));
    assert.ok(ids.includes('files'));
    assert.ok(ids.includes('notifications'));
    assert.equal(ids.includes('users'), false);
    assert.equal(ids.includes('accounts'), false);
    assert.equal(ids.includes('audit'), false);
    assert.equal(ids.includes('rbac'), false);
  });

  it('SELF scope không mở domain users', () => {
    const ctx = {
      ...grantsOf({ [RBAC_GRANT.EMPLOYEE_VIEW]: 'SELF' }),
      isSystemAdmin: false,
    };
    const ids = domainIds(listAdminDomainsForActor(CATALOG, ctx));
    assert.equal(ids.includes('users'), false);
  });

  it('firstAllowedAdminLeafPath không dùng domain.path mù khi leaf đầu khác', () => {
    const ctx = {
      ...grantsOf({
        [RBAC_GRANT.EMPLOYEE_UPDATE]: 'ORGANIZATION',
      }),
      isSystemAdmin: false,
    };
    const rbac = CATALOG.find((d) => d.id === 'rbac');
    assert.ok(rbac);
    const leaf = firstAllowedAdminLeafPath(rbac, ctx);
    assert.equal(leaf, '/app/admin/rbac/positions/assign');
    assert.notEqual(leaf, rbac.path);
  });
});
