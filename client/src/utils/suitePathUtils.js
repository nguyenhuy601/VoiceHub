/** Suite-based routing — thay URL /w/:slug */

export const SUITE = {
  COMMUNICATE: 'COMMUNICATE',
  COLLABORATE: 'COLLABORATE',
  ME: 'ME',
  ADMIN: 'ADMIN',
};

export const SUITE_STORAGE_KEY = 'voicehub:current-suite';
export const LAST_ORG_ID_KEY = 'voicehub:last-organization-id';

const SUITE_SEGMENT = {
  [SUITE.COMMUNICATE]: 'communicate',
  [SUITE.COLLABORATE]: 'collaborate',
  [SUITE.ME]: 'me',
  [SUITE.ADMIN]: 'admin',
};

const SEGMENT_TO_SUITE = Object.fromEntries(
  Object.entries(SUITE_SEGMENT).map(([k, v]) => [v, k])
);

export const SUITE_DEFAULT_PATH = {
  [SUITE.COMMUNICATE]: '/app/communicate/overview',
  [SUITE.COLLABORATE]: '/app/collaborate/overview',
  [SUITE.ME]: '/app/me/dashboard',
  [SUITE.ADMIN]: '/app/admin',
};

export function normalizeSuite(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (Object.values(SUITE).includes(raw)) return raw;
  const fromSegment = SEGMENT_TO_SUITE[String(value || '').trim().toLowerCase()];
  return fromSegment || SUITE.COMMUNICATE;
}

export function suiteToSegment(suite) {
  return SUITE_SEGMENT[normalizeSuite(suite)] || 'communicate';
}

export function readStoredSuite() {
  if (typeof window === 'undefined') return SUITE.COMMUNICATE;
  return normalizeSuite(window.localStorage.getItem(SUITE_STORAGE_KEY));
}

export function writeStoredSuite(suite) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SUITE_STORAGE_KEY, normalizeSuite(suite));
}

export function readStoredLastOrganizationId() {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(LAST_ORG_ID_KEY) || '').trim();
}

export function writeStoredLastOrganizationId(orgId) {
  if (typeof window === 'undefined') return;
  const id = String(orgId || '').trim();
  if (id) window.localStorage.setItem(LAST_ORG_ID_KEY, id);
  else window.localStorage.removeItem(LAST_ORG_ID_KEY);
}

export function suiteBasePath(suite) {
  return `/app/${suiteToSegment(suite)}`;
}

export function getDefaultPathForSuite(suite) {
  return SUITE_DEFAULT_PATH[normalizeSuite(suite)] || SUITE_DEFAULT_PATH[SUITE.COMMUNICATE];
}

export function detectSuiteFromPath(pathname) {
  const path = String(pathname || '');
  if (path.startsWith('/app/admin')) return SUITE.ADMIN;
  if (path.startsWith('/app/communicate')) return SUITE.COMMUNICATE;
  if (path.startsWith('/app/collaborate')) return SUITE.COLLABORATE;
  if (path.startsWith('/app/me')) return SUITE.ME;
  return null;
}

import { LEGACY_ADMIN_TAB_TO_PATH } from '../config/adminNavConfig';

/** Map legacy ?tab= trên /app/collaborate/admin sang route admin mới. */
export function mapLegacyAdminTabToPath(tab) {
  const raw = String(tab || 'overview').trim().toLowerCase();
  return LEGACY_ADMIN_TAB_TO_PATH[raw] || LEGACY_ADMIN_TAB_TO_PATH.overview;
}

/** Org-scoped paths (không dùng slug trên URL). */
export function buildCommunicateChannelsPath(orgId = '', query = {}) {
  const base = '/app/communicate/channels';
  const params = new URLSearchParams();
  const id = String(orgId || '').trim();
  if (id) params.set('organizationId', id);
  const deptId = String(query?.departmentId || '').trim();
  const channelId = String(query?.channelId || '').trim();
  if (deptId) params.set('departmentId', deptId);
  if (channelId) params.set('channelId', channelId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildCollaborateTasksPath(orgId = '') {
  const base = '/app/collaborate/tasks';
  const id = String(orgId || '').trim();
  return id ? `${base}?organizationId=${encodeURIComponent(id)}` : base;
}

export function buildCollaborateDocumentsPath(orgId = '') {
  const base = '/app/collaborate/documents';
  const id = String(orgId || '').trim();
  return id ? `${base}?organizationId=${encodeURIComponent(id)}` : base;
}

export function buildCollaborateOrgNotificationsPath(orgId = '') {
  const base = '/app/collaborate/notifications';
  const id = String(orgId || '').trim();
  return id ? `${base}?organizationId=${encodeURIComponent(id)}` : base;
}

export function buildCollaborateSettingsPath(orgId) {
  const id = String(orgId || '').trim();
  return id ? `/app/collaborate/organizations/${encodeURIComponent(id)}/settings` : '/app/collaborate/workspaces';
}

export function orgQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('organizationId') || params.get('orgId') || '').trim();
}

export function departmentQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('departmentId') || '').trim();
}

export function channelQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('channelId') || '').trim();
}

/** Legacy /w/:slug/:tab → suite route (tab: chat|tasks|documents|notifications). */
export function legacyWorkspaceTabToSuitePath(tab, orgId = '') {
  const t = String(tab || 'chat').trim().toLowerCase();
  const id = String(orgId || '').trim();
  if (t === 'tasks') return buildCollaborateTasksPath(id);
  if (t === 'documents') return buildCollaborateDocumentsPath(id);
  if (t === 'notifications') return buildCollaborateOrgNotificationsPath(id);
  return buildCommunicateChannelsPath(id);
}

export function parseLegacyWorkspacePath(pathname) {
  const match = String(pathname || '')
    .replace(/\/+/g, '/')
    .match(/^\/w\/([^/]+)(?:\/([^/?]+))?\/?$/);
  if (!match) return null;
  let slug = '';
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = String(match[1] || '');
  }
  const tab = String(match[2] || 'chat').trim().toLowerCase() || 'chat';
  return { slug, tab };
}
