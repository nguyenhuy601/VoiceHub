import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADMIN_DOMAINS,
  getVisibleAdminDomains,
  resolveAdminLegacyRedirect,
} from '../src/config/adminDomainsConfig.js';

const HIDDEN_DOMAIN_IDS = ['notifications', 'monitoring', 'ai', 'chat'];
const REMOVED_IMPLEMENTATIONS = ['notifications-config', 'chat-config', 'channels-manage', 'files-ops'];

function allItems(domains) {
  return domains.flatMap((domain) => domain.sections.flatMap((section) => section.items.map((item) => ({ domain, item }))));
}

describe('admin nav visibility', () => {
  it('domain hidden không lên hub/sidebar (full-access và user thường)', () => {
    for (const isFullAccess of [true, false]) {
      const ids = getVisibleAdminDomains(isFullAccess).map((d) => d.id);
      for (const hidden of HIDDEN_DOMAIN_IDS) assert.equal(ids.includes(hidden), false, hidden);
    }
  });

  it('user thường không thấy domain adminOnly', () => {
    const ids = getVisibleAdminDomains(false).map((d) => d.id);
    for (const domain of ADMIN_DOMAINS.filter((d) => d.adminOnly)) {
      assert.equal(ids.includes(domain.id), false, domain.id);
    }
  });

  it('mọi item hiện trên sidebar của domain hiển thị đều có implementation', () => {
    const missing = allItems(getVisibleAdminDomains(true))
      .filter(({ item }) => item.nav !== 'hidden' && item.nav !== 'action' && !item.implementation)
      .map(({ item }) => item.path);
    assert.deepEqual(missing, []);
  });

  it('không item nào trỏ tới hub đã xóa', () => {
    const stale = allItems(ADMIN_DOMAINS)
      .filter(({ item }) => REMOVED_IMPLEMENTATIONS.includes(item.implementation))
      .map(({ item }) => item.path);
    assert.deepEqual(stale, []);
  });

  it('bookmark cũ redirect về trang thật gần nhất', () => {
    const cases = {
      '/app/admin/ai/summary': '/app/admin/voice/meeting-ops?tab=summary',
      '/app/admin/channels/manage': '/app/admin/channels',
      '/app/admin/channels/edit': '/app/admin/channels',
      '/app/admin/channels/members': '/app/admin/channels',
      '/app/admin/channels/visibility': '/app/admin/channels',
      '/app/admin/channels/transfer': '/app/admin/channels',
      '/app/admin/channels/archive': '/app/admin/channels',
      '/app/admin/channels/restore': '/app/admin/channels',
      '/app/admin/files/ops': '/app/admin/files',
      '/app/admin/files/restore': '/app/admin/files',
      '/app/admin/files/export': '/app/admin/files',
      '/app/admin/files/delete': '/app/admin/files',
      '/app/admin/files/storage': '/app/admin/files',
      '/app/admin/files/quota': '/app/admin/files',
      '/app/admin/reports': '/app/admin/reports/tasks',
      '/app/admin/reports/chat': '/app/admin/reports/tasks',
      '/app/admin/reports/voice': '/app/admin/reports/tasks',
      '/app/admin/reports/storage': '/app/admin/reports/tasks',
      '/app/admin/reports/export': '/app/admin/reports/tasks',
      '/app/admin/reports/login': '/app/admin/security/sessions',
      '/app/admin/system-config/logo': '/app/admin/system-config',
      '/app/admin/system-config/language': '/app/admin/system-config',
      '/app/admin/system-config/timezone': '/app/admin/system-config',
      '/app/admin/system-config/work-hours': '/app/admin/system-config',
      '/app/admin/system-config/holidays': '/app/admin/system-config',
      '/app/admin/backup/schedule': '/app/admin/backup',
      '/app/admin/backup/export': '/app/admin/backup',
      '/app/admin/backup/import': '/app/admin/backup',
      '/app/admin/backup/restore': '/app/admin/backup',
      '/app/admin/security/session-timeout': '/app/admin/security',
      '/app/admin/security/devices': '/app/admin/security/sessions',
      '/app/admin/security/login-history': '/app/admin/security/sessions',
      '/app/admin/audit/login': '/app/admin/security/sessions',
    };
    for (const [from, to] of Object.entries(cases)) {
      const resolved = resolveAdminLegacyRedirect(from, '');
      assert.ok(resolved, from);
      assert.equal(`${resolved.pathname}${resolved.search}`, to, from);
    }
  });
});
