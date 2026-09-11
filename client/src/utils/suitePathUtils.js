/** Suite-based routing — Company + Projects (Collaborate deprecated → redirect). */

export const SUITE = {
  COMMUNICATE: 'COMMUNICATE',
  COMPANY: 'COMPANY',
  PROJECTS: 'PROJECTS',
  ME: 'ME',
  ADMIN: 'ADMIN',
  /** @deprecated Use COMPANY — kept for stored localStorage / legacy callers */
  COLLABORATE: 'COLLABORATE',
};

export const SUITE_STORAGE_KEY = 'voicehub:current-suite';
export const LAST_ORG_ID_KEY = 'voicehub:last-organization-id';

const SUITE_SEGMENT = {
  [SUITE.COMMUNICATE]: 'communicate',
  [SUITE.COMPANY]: 'company',
  [SUITE.PROJECTS]: 'projects',
  [SUITE.ME]: 'me',
  [SUITE.ADMIN]: 'admin',
  [SUITE.COLLABORATE]: 'collaborate',
};

const SEGMENT_TO_SUITE = {
  communicate: SUITE.COMMUNICATE,
  company: SUITE.COMPANY,
  projects: SUITE.PROJECTS,
  me: SUITE.ME,
  admin: SUITE.ADMIN,
  /** Legacy URL segment maps to COMPANY for storage/navigation */
  collaborate: SUITE.COMPANY,
};

export const SUITE_DEFAULT_PATH = {
  [SUITE.COMMUNICATE]: '/app/communicate/overview',
  [SUITE.COMPANY]: '/app/company/home',
  [SUITE.PROJECTS]: '/app/projects',
  [SUITE.ME]: '/app/me/dashboard',
  [SUITE.ADMIN]: '/app/admin',
  [SUITE.COLLABORATE]: '/app/company/home',
};

export function normalizeSuite(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'COLLABORATE') return SUITE.COMPANY;
  if (Object.values(SUITE).includes(raw) && raw !== 'COLLABORATE') return raw;
  const fromSegment = SEGMENT_TO_SUITE[String(value || '').trim().toLowerCase()];
  return fromSegment || SUITE.COMMUNICATE;
}

export function suiteToSegment(suite) {
  const normalized = normalizeSuite(suite);
  return SUITE_SEGMENT[normalized] || 'communicate';
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
  const normalized = normalizeSuite(suite);
  return SUITE_DEFAULT_PATH[normalized] || SUITE_DEFAULT_PATH[SUITE.COMMUNICATE];
}

export function detectSuiteFromPath(pathname) {
  const path = String(pathname || '');
  if (path.startsWith('/app/admin')) return SUITE.ADMIN;
  if (path.startsWith('/app/communicate')) return SUITE.COMMUNICATE;
  if (path.startsWith('/app/company')) return SUITE.COMPANY;
  if (path.startsWith('/app/projects')) return SUITE.PROJECTS;
  if (path.startsWith('/app/collaborate')) return SUITE.COMPANY;
  if (path.startsWith('/app/me')) return SUITE.ME;
  return null;
}

/** Inline map — avoid importing adminDomainsConfig (heavy / no .js extension for node --test). */
const LEGACY_ADMIN_TAB_TO_PATH = {
  overview: '/app/admin',
  people: '/app/admin/users',
  approvals: '/app/admin/users',
  general: '/app/admin/system-config',
  structure: '/app/admin/system-config?tab=structure',
  roles: '/app/admin/rbac/roles',
  policy: '/app/admin/system-config/policy',
  join: '/app/admin/users',
  security: '/app/admin/security',
};

import { normalizeProjectModule } from './suiteNavConfig.js';

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

export function isProjectChatTabEnabled() {
  const raw = String(import.meta.env.VITE_PROJECT_CHAT_TAB ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function appendOrgQuery(base, orgId = '', extra = {}) {
  const params = new URLSearchParams();
  const id = String(orgId || '').trim();
  if (id) params.set('organizationId', id);
  for (const [key, value] of Object.entries(extra || {})) {
    const v = String(value || '').trim();
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/* ——— Company suite ——— */

export function buildCompanyOverviewPath(orgId = '') {
  return appendOrgQuery('/app/company/overview', orgId);
}

export function buildCompanyHomePath({
  organizationId = '',
  departmentId = '',
  teamId = '',
} = {}) {
  return appendOrgQuery('/app/company/home', organizationId, {
    departmentId,
    teamId,
  });
}

export function buildCompanyWorkspacePath({
  organizationId = '',
  departmentId = '',
  teamId = '',
  tab = '',
  channelId = '',
} = {}) {
  const base = '/app/company/workspaces';
  const params = new URLSearchParams();
  const orgId = String(organizationId || '').trim();
  const deptId = String(departmentId || '').trim();
  const tid = String(teamId || '').trim();
  const tabId = String(tab || '').trim().toLowerCase();
  const chId = String(channelId || '').trim();
  if (orgId) params.set('organizationId', orgId);
  if (deptId) params.set('departmentId', deptId);
  if (tid) params.set('teamId', tid);
  if (tabId) params.set('tab', tabId);
  if (chId) params.set('channelId', chId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildCompanyChatPath(orgId = '', query = {}) {
  return appendOrgQuery('/app/company/chat', orgId, {
    departmentId: query?.departmentId,
    teamId: query?.teamId,
    channelId: query?.channelId,
    tab: query?.tab,
  });
}

/** True when pathname is the company suite chat module (not /workspaces). */
export function isCompanyChatModulePath(pathname = '') {
  const p = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '';
  return p === '/app/company/chat';
}

export function buildCompanyDocumentsPath(orgId = '', query = {}) {
  return appendOrgQuery('/app/company/documents', orgId, {
    departmentId: query?.departmentId,
    teamId: query?.teamId,
    tab: query?.tab || (query?.departmentId ? 'documents' : ''),
  });
}

export function buildCompanyCalendarPath(orgId = '', query = {}) {
  return appendOrgQuery('/app/company/calendar', orgId, {
    departmentId: query?.departmentId,
    // Calendar stays department-scoped even in team mode
    tab: query?.tab || (query?.departmentId ? 'calendar' : ''),
  });
}

export function buildCompanyApprovalsPath(orgId = '') {
  return appendOrgQuery('/app/company/approvals', orgId);
}

export function buildCompanyOrgNotificationsPath(orgId = '') {
  return appendOrgQuery('/app/company/notifications', orgId);
}

export function buildCompanySettingsPath(orgId) {
  const id = String(orgId || '').trim();
  return id
    ? `/app/company/organizations/${encodeURIComponent(id)}/settings`
    : '/app/company/workspaces';
}

/* ——— Projects suite ——— */

export function buildProjectsPickerPath(orgId = '') {
  return appendOrgQuery('/app/projects', orgId);
}

export function buildProjectsModulePath(projectId, module = 'overview', query = {}) {
  const pid = String(projectId || '').trim();
  if (!pid) return buildProjectsPickerPath(query?.organizationId || query?.orgId || '');
  const mod = normalizeProjectModule(module);
  const base = `/app/projects/${encodeURIComponent(pid)}/${mod}`;
  const params = new URLSearchParams();
  const orgId = String(query?.organizationId || query?.orgId || '').trim();
  const boardId = String(query?.boardId || '').trim();
  const channelId = String(query?.channelId || '').trim();
  if (orgId) params.set('organizationId', orgId);
  if (boardId) params.set('boardId', boardId);
  if (channelId) params.set('channelId', channelId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildProjectsNewPath(orgId = '', query = {}) {
  const base = '/app/projects/new';
  const params = new URLSearchParams();
  const id = String(orgId || '').trim();
  if (id) params.set('organizationId', id);
  const from = String(query?.from || '').trim();
  if (from) params.set('from', from);
  const title = String(query?.title || '').trim();
  const description = String(query?.description || '').trim();
  const projectCode = String(query?.projectCode || '').trim();
  const briefId = String(query?.briefId || '').trim();
  if (title) params.set('title', title);
  if (description) params.set('description', description);
  if (projectCode) params.set('projectCode', projectCode);
  if (briefId) params.set('briefId', briefId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildProjectsNewAiPath(orgId = '', query = {}) {
  const base = '/app/projects/new-ai';
  const params = new URLSearchParams();
  const id = String(orgId || '').trim();
  if (id) params.set('organizationId', id);
  const from = String(query?.from || '').trim();
  if (from) params.set('from', from);
  const projectId = String(query?.projectId || '').trim();
  if (projectId) params.set('projectId', projectId);
  const packId = String(query?.packId || '').trim();
  if (packId) params.set('packId', packId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/* ——— Legacy Collaborate builders → new suite paths (compat) ——— */

export function buildCollaborateProjectsChatPath(orgId = '', query = {}) {
  const projectId = String(query?.projectId || '').trim();
  if (projectId) {
    return buildProjectsModulePath(projectId, 'chat', {
      organizationId: orgId || query?.organizationId,
      channelId: query?.channelId,
    });
  }
  return buildProjectsPickerPath(orgId || query?.organizationId);
}

export function buildCollaborateProjectsPath(orgId = '', query = {}) {
  const projectId = String(query?.projectId || '').trim();
  if (projectId) {
    return buildProjectsModulePath(projectId, 'overview', {
      organizationId: orgId || query?.organizationId,
      boardId: query?.boardId,
    });
  }
  return buildProjectsPickerPath(orgId || query?.organizationId);
}

export function buildCollaborateProjectHubPath(projectId, query = {}) {
  const module = query?.module || query?.tab || 'overview';
  return buildProjectsModulePath(projectId, module, query);
}

export function buildCollaborateTasksPath(orgId = '', query = {}) {
  return buildCollaborateProjectsPath(orgId, query);
}

export function buildCollaborateDocumentsPath(orgId = '') {
  return buildCompanyDocumentsPath(orgId);
}

export function buildCollaborateCalendarPath(orgId = '') {
  return buildCompanyCalendarPath(orgId);
}

export function buildCollaborateWorkspacePath(opts = {}) {
  return buildCompanyWorkspacePath(opts);
}

export function buildCollaborateRequirementsPath(orgId = '', query = {}) {
  const projectId = String(query?.projectId || '').trim();
  if (projectId) {
    return buildProjectsModulePath(projectId, 'requirements', { organizationId: orgId });
  }
  return appendOrgQuery('/app/projects/requirements', orgId);
}

export function buildCollaborateOrgNotificationsPath(orgId = '') {
  return buildCompanyOrgNotificationsPath(orgId);
}

export function buildCollaborateSettingsPath(orgId) {
  return buildCompanySettingsPath(orgId);
}

export function buildCollaborateProjectsNewPath(orgId = '', query = {}) {
  return buildProjectsNewPath(orgId, query);
}

export function buildCollaborateProjectsNewAiPath(orgId = '', query = {}) {
  return buildProjectsNewAiPath(orgId, query);
}

export function orgQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('organizationId') || params.get('orgId') || '').trim();
}

export function departmentQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('departmentId') || '').trim();
}

export function teamQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('teamId') || '').trim();
}

export function boardQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('boardId') || '').trim();
}

export function projectQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('projectId') || '').trim();
}

export function channelQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('channelId') || '').trim();
}

/** Tab module phòng trên workspaces?tab= */
export function workspaceTabQueryFromSearch(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : search || '');
  return String(params.get('tab') || '').trim().toLowerCase();
}

/** Legacy /w/:slug/:tab → suite route */
export function legacyWorkspaceTabToSuitePath(tab, orgId = '') {
  const t = String(tab || 'chat').trim().toLowerCase();
  const id = String(orgId || '').trim();
  if (t === 'tasks') return buildCollaborateTasksPath(id);
  if (t === 'documents') return buildCompanyDocumentsPath(id);
  if (t === 'notifications') return buildCompanyOrgNotificationsPath(id);
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

/**
 * Map legacy /app/collaborate/* pathname + search → new suite path.
 */
export function mapCollaboratePathToDualSuite(pathname, search = '') {
  const path = String(pathname || '').replace(/\/+/g, '/');
  const params = new URLSearchParams(
    typeof search === 'string' ? search.replace(/^\?/, '') : ''
  );
  const orgId = String(params.get('organizationId') || params.get('orgId') || '').trim();
  const qs = () => {
    const next = new URLSearchParams(params);
    const s = next.toString();
    return s ? `?${s}` : '';
  };

  if (path === '/app/collaborate' || path === '/app/collaborate/') {
    return `/app/company/home${qs()}`;
  }
  if (path.startsWith('/app/collaborate/overview')) {
    return `/app/company/overview${qs()}`;
  }
  if (path.startsWith('/app/collaborate/workspaces')) {
    return `/app/company/workspaces${qs()}`;
  }
  if (path.startsWith('/app/collaborate/documents')) {
    return `/app/company/documents${qs()}`;
  }
  if (path.startsWith('/app/collaborate/calendar')) {
    return `/app/company/calendar${qs()}`;
  }
  if (path.startsWith('/app/collaborate/approvals')) {
    return `/app/company/approvals${qs()}`;
  }
  if (path.startsWith('/app/collaborate/notifications')) {
    return `/app/company/notifications${qs()}`;
  }
  if (path.startsWith('/app/collaborate/join/')) {
    return path.replace('/app/collaborate/join/', '/app/company/join/') + qs();
  }
  if (path.startsWith('/app/collaborate/organizations/')) {
    return path.replace('/app/collaborate/organizations/', '/app/company/organizations/') + qs();
  }
  if (path.startsWith('/app/collaborate/admin')) {
    return mapLegacyAdminTabToPath(params.get('tab'));
  }
  if (path.startsWith('/app/collaborate/projects/new-ai')) {
    return `/app/projects/new-ai${qs()}`;
  }
  if (path.startsWith('/app/collaborate/projects/new')) {
    return `/app/projects/new${qs()}`;
  }
  if (path.startsWith('/app/collaborate/projects/chat')) {
    const projectId = String(params.get('projectId') || '').trim();
    if (projectId) {
      return buildProjectsModulePath(projectId, 'chat', { organizationId: orgId });
    }
    return buildProjectsPickerPath(orgId);
  }
  const hubMatch = path.match(/^\/app\/collaborate\/projects\/([^/]+)\/?$/);
  if (hubMatch) {
    const projectId = decodeURIComponent(hubMatch[1]);
    const tab = String(params.get('tab') || 'overview').trim();
    const boardId = String(params.get('boardId') || '').trim();
    return buildProjectsModulePath(projectId, tab, { organizationId: orgId, boardId });
  }
  if (path.startsWith('/app/collaborate/projects') || path.startsWith('/app/collaborate/tasks')) {
    return buildProjectsPickerPath(orgId);
  }
  if (path.startsWith('/app/collaborate/requirements')) {
    return appendOrgQuery('/app/projects/requirements', orgId);
  }
  return `/app/company/home${qs()}`;
}
