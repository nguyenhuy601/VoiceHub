/**
 * Wave 2 — mọi item domain ưu tiên (và sau đó toàn bộ) phải có requiredGrant hoặc adminOnly.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_DOMAINS } from './adminDomainsConfig.js';
import { navItemIsAllowed, navItemRequiredGrant } from './rbacUiGrantMap.js';

const PRIORITY_DOMAIN_IDS = Object.freeze([
  'rbac',
  'projects',
  'security',
  'audit',
  'files',
  'voice',
]);

const REMAINING_DOMAIN_IDS = Object.freeze([
  'chat',
  'notifications',
  'ai',
  'backup',
  'system-config',
  'monitoring',
  'reports',
]);

function domainItems(domainId) {
  const domain = ADMIN_DOMAINS.find((d) => d.id === domainId);
  assert.ok(domain, `missing domain ${domainId}`);
  return domain.sections.flatMap((s) => s.items || []);
}

function assertItemHasGrantOrAdminOnly(domainId, item) {
  const hasGrant = Boolean(String(item.requiredGrant || '').trim());
  const adminOnly = Boolean(item.adminOnly);
  assert.ok(
    hasGrant || adminOnly,
    `${domainId}/${item.id} (${item.path}) missing requiredGrant and adminOnly`
  );
}

describe('adminDomainsConfig grants', () => {
  it('priority domains: every item has requiredGrant or adminOnly', () => {
    for (const id of PRIORITY_DOMAIN_IDS) {
      for (const item of domainItems(id)) {
        assertItemHasGrantOrAdminOnly(id, item);
      }
    }
  });

  it('rbac project-roles keep adminOnly and requiredGrant', () => {
    const items = domainItems('rbac').filter((i) => String(i.id).startsWith('project-role-'));
    assert.equal(items.length, 6);
    for (const item of items) {
      assert.equal(item.adminOnly, true, item.id);
      assert.ok(String(item.requiredGrant || '').startsWith('organization.master_data.'), item.id);
    }
  });

  it('non-full-access without grant cannot see priority items that declare requiredGrant', () => {
    const hasNone = () => false;
    for (const id of PRIORITY_DOMAIN_IDS) {
      for (const item of domainItems(id)) {
        if (item.adminOnly) {
          assert.equal(
            navItemIsAllowed(item, { isFullAccess: false, hasGrant: hasNone }),
            false,
            `${id}/${item.id} adminOnly`
          );
          continue;
        }
        const key = navItemRequiredGrant(item);
        if (!key) continue;
        assert.equal(
          navItemIsAllowed(item, { isFullAccess: false, hasGrant: hasNone }),
          false,
          `${id}/${item.id} deny without ${key}`
        );
        assert.equal(
          navItemIsAllowed(item, {
            isFullAccess: false,
            hasGrant: (g) => g === key,
            scopeOf: () => 'ORGANIZATION',
          }),
          true,
          `${id}/${item.id} allow with ${key}`
        );
        assert.equal(
          navItemIsAllowed(item, {
            isFullAccess: false,
            hasGrant: (g) => g === key,
            scopeOf: () => 'SELF',
          }),
          false,
          `${id}/${item.id} SELF does not open admin`
        );
      }
    }
  });

  it('remaining domains: every item has requiredGrant or adminOnly', () => {
    for (const id of REMAINING_DOMAIN_IDS) {
      for (const item of domainItems(id)) {
        assertItemHasGrantOrAdminOnly(id, item);
      }
    }
  });
});
