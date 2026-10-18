import { navItemIsAllowed } from './rbacUiGrantMap.js';

function normalizeAdminRoutePath(pathname) {
  return String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/app/admin';
}

/** Danh sách mục để quyết định URL. Domain ẩn vẫn khớp URL gõ thẳng. */
export function collectAdminRouteEntries(domains) {
  const entries = [];
  for (const domain of domains || []) {
    const hidden = domain?.nav === 'hidden';
    for (const section of domain?.sections || []) {
      for (const item of section.items || []) {
        const path = String(item.path || '').split('?')[0].replace(/\/+$/, '');
        if (!path) continue;
        entries.push({
          path,
          requiredGrant: String(item.requiredGrant || '').trim(),
          adminOnly: Boolean(item.adminOnly),
          end: Boolean(item.end),
          hidden,
        });
      }
    }
  }
  return entries;
}

function entryIsAllowed(entry, ctx) {
  return navItemIsAllowed(
    {
      path: entry.path,
      requiredGrant: entry.requiredGrant,
      adminOnly: entry.adminOnly,
      id: '',
    },
    ctx
  );
}

function matchEntry(pathname, entries) {
  const path = normalizeAdminRoutePath(pathname);
  let best = null;
  let bestLen = -1;
  for (const entry of entries) {
    const itemPath = entry.path;
    const matches = entry.end ? path === itemPath : path === itemPath || path.startsWith(`${itemPath}/`);
    if (matches && itemPath.length > bestLen) {
      best = entry;
      bestLen = itemPath.length;
    }
  }
  return best;
}

function firstAllowedPath(entries, ctx) {
  const visible = entries.find((entry) => !entry.hidden && entryIsAllowed(entry, ctx));
  if (visible) return visible.path;
  const hidden = entries.find((entry) => entryIsAllowed(entry, ctx));
  return hidden?.path || '';
}

/**
 * @returns {{ action: 'enter' | 'redirect-work' | 'redirect-first-allowed', path?: string }}
 */
export function decideAdminRoute({ pathname, entries, hasGrant, scopeOf, isSystemAdmin = false } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const ctx = { hasGrant, scopeOf, isSystemAdmin: Boolean(isSystemAdmin) };
  const nextPath = firstAllowedPath(list, ctx);
  const path = normalizeAdminRoutePath(pathname);

  if (path === '/app/admin') {
    if (ctx.isSystemAdmin || nextPath) return { action: 'enter' };
    return { action: 'redirect-work' };
  }

  // URL policy cũ không còn mục riêng. Người có cửa hub thì vào hub, không rơi về trang nhân viên.
  if (path === '/app/admin/system-config/policy' || path === '/app/admin/policy') {
    const hub = list.find((entry) => entry.path === '/app/admin/system-config');
    if (hub && entryIsAllowed(hub, ctx)) {
      return { action: 'redirect-first-allowed', path: hub.path };
    }
  }

  const match = matchEntry(path, list);
  if (match && entryIsAllowed(match, ctx)) return { action: 'enter' };
  if (nextPath) return { action: 'redirect-first-allowed', path: nextPath };
  return { action: 'redirect-work' };
}
