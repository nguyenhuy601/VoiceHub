/** @deprecated — dùng adminDomainsConfig.js; giữ re-export tương thích import cũ. */
export {
  ADMIN_SUITE_COLOR,
  LEGACY_ADMIN_TAB_TO_PATH,
  adminSettingsEmbedTabFromItem as adminSettingsEmbedTab,
  findAdminNavItem,
  resolveAdminDomainFromPath,
} from './adminDomainsConfig';

import { findAdminNavItem } from './adminDomainsConfig';

/** @deprecated */
export const ADMIN_SECTIONS = [];

/** @deprecated */
export function resolveAdminSectionFromPath(pathname) {
  const match = findAdminNavItem(pathname);
  if (match?.item?.settingsTab) return match.item.id;
  const base = String(pathname || '').replace(/\/+$/, '');
  if (base === '/app/admin') return 'overview';
  const slug = base.match(/^\/app\/admin\/([^/]+)/)?.[1];
  return slug || 'overview';
}
