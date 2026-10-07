import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADMIN_DOMAINS,
  resolveAdminLegacyRedirect,
} from '../src/config/adminDomainsConfig.js';
import {
  navItemIsAllowed,
  filterAdminDomainByGrant,
} from '../src/config/rbacUiGrantMap.js';

function findDomain(id) {
  return ADMIN_DOMAINS.find((d) => d.id === id);
}

describe('admin projects nav (W7-8 Step 1)', () => {
  it('adminOnly item denied without full access', () => {
    assert.equal(
      navItemIsAllowed({ adminOnly: true, id: 'x' }, { isFullAccess: false, hasGrant: () => true }),
      false
    );
    assert.equal(
      navItemIsAllowed({ adminOnly: true, id: 'x' }, { isFullAccess: true, hasGrant: () => false }),
      true
    );
  });

  it('six project-role items are adminOnly', () => {
    const rbac = findDomain('rbac');
    const section = rbac.sections.find((s) => s.id === 'projectRoles');
    const ids = section.items.map((i) => i.id);
    for (const id of [
      'project-role-list',
      'project-role-create',
      'project-role-board',
      'project-role-manage',
      'project-role-edit',
      'project-role-delete',
    ]) {
      assert.ok(ids.includes(id), id);
      const item = section.items.find((i) => i.id === id);
      assert.equal(item.adminOnly, true, id);
    }
  });

  it('non-full-access filter hides project-role items', () => {
    const rbac = findDomain('rbac');
    const filtered = filterAdminDomainByGrant(rbac, {
      isFullAccess: false,
      hasGrant: () => true,
    });
    const section = filtered.sections.find((s) => s.id === 'projectRoles');
    assert.equal(section.items.length, 0);
  });

  it('priority nav item removed; redirect works', () => {
    const projects = findDomain('projects');
    const items = projects.sections.flatMap((s) => s.items);
    assert.equal(items.some((i) => i.id === 'priority'), false);
    const status = items.find((i) => i.id === 'status');
    assert.equal(status?.labelKey, 'adminDomains.projects.statusPriority');
    const redirected = resolveAdminLegacyRedirect('/app/admin/projects/priority');
    assert.equal(redirected?.pathname || redirected, '/app/admin/projects/status');
  });

  it('no tasks-coming-soon implementation; visible items have implementation', () => {
    const projects = findDomain('projects');
    for (const section of projects.sections) {
      for (const item of section.items) {
        if (item.nav === 'hidden' || item.nav === 'action') continue;
        assert.ok(item.implementation, item.id);
        assert.notEqual(item.implementation, 'tasks-coming-soon');
      }
    }
  });
});
