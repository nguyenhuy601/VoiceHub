/** Suite-based routing — thay URL /w/:slug */

export const SUITE = {
  COMMUNICATE: 'COMMUNICATE',
  COLLABORATE: 'COLLABORATE',
  ME: 'ME',
};

export const SUITE_STORAGE_KEY = 'voicehub:current-suite';
export const LAST_ORG_ID_KEY = 'voicehub:last-organization-id';

const SUITE_SEGMENT = {
  [SUITE.COMMUNICATE]: 'communicate',
  [SUITE.COLLABORATE]: 'collaborate',
  [SUITE.ME]: 'me',
};

const SEGMENT_TO_SUITE = Object.fromEntries(
  Object.entries(SUITE_SEGMENT).map(([k, v]) => [v, k])
);

export const SUITE_DEFAULT_PATH = {
  [SUITE.COMMUNICATE]: '/app/communicate/chat/friends',
  [SUITE.COLLABORATE]: '/app/collaborate/workspaces',
  [SUITE.ME]: '/app/me/dashboard',
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
  if (path.startsWith('/app/communicate')) return SUITE.COMMUNICATE;
  if (path.startsWith('/app/collaborate')) return SUITE.COLLABORATE;
  if (path.startsWith('/app/me')) return SUITE.ME;
  return null;
}

/** Org-scoped paths (không dùng slug trên URL). */
export function buildCommunicateChannelsPath(orgId = '') {
  const base = '/app/communicate/channels';
  const id = String(orgId || '').trim();
  return id ? `${base}?organizationId=${encodeURIComponent(id)}` : base;
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
