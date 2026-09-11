/**
 * Suite sidebar nav config — Company (fixed) + Projects (pre/post select).
 * Groups: work (Công việc) | collab (Cộng tác) | ops (Vận hành)
 * Post-select menu filtered by Project.deliveryPhase via projectPhaseNav.
 */

import {
  filterNavItemsByDeliveryPhase,
  PHASE_MODULE_LABEL_KEYS,
} from './projectPhaseNav.js';

export const PROJECT_MENU_GROUPS = {
  WORK: 'work',
  COLLAB: 'collab',
  OPS: 'ops',
};

/** Hub tab id / path segment → menu module key (incl. Phase 1 analysis modules) */
export const PROJECT_MODULE_KEYS = [
  'overview',
  'list',
  'planning',
  'board',
  'timeline',
  'change-requests',
  'requirements',
  'files',
  'chat',
  'calendar',
  'documents',
  'members',
  'activity',
  'settings',
  'customer-documents',
  'analysis-bg',
  'analysis-br',
  'analysis-bpm',
  'analysis-fr',
  'analysis-uc',
  'analysis-nfr',
  'analysis-scope',
  'traceability',
  'analysis-reviews',
  'srs-baselines',
  'delivery-planning',
];

/** Map legacy hub tab ids to path modules */
export const HUB_TAB_TO_MODULE = {
  overview: 'overview',
  list: 'list',
  planning: 'planning',
  board: 'board',
  timeline: 'timeline',
  changeRequests: 'change-requests',
  chat: 'chat',
  members: 'members',
  files: 'files',
  activity: 'activity',
  settings: 'settings',
};

export const MODULE_TO_HUB_TAB = {
  overview: 'overview',
  list: 'list',
  planning: 'planning',
  board: 'board',
  timeline: 'timeline',
  'change-requests': 'changeRequests',
  chat: 'chat',
  members: 'members',
  files: 'files',
  activity: 'activity',
  settings: 'settings',
  requirements: 'requirements',
  calendar: 'calendar',
  documents: 'documents',
};

export function normalizeProjectModule(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'overview';
  if (value.toLowerCase() === 'report') return 'overview';
  if (HUB_TAB_TO_MODULE[value]) return HUB_TAB_TO_MODULE[value];
  const lower = value.toLowerCase();
  if (lower === 'changerequests' || lower === 'change-requests') return 'change-requests';
  if (PROJECT_MODULE_KEYS.includes(lower)) return lower;
  return 'overview';
}

/**
 * Company L1 nav — home + scoped modules (dept/team via SpaceContext query).
 * @param {{ level?: string }} [opts]
 */
export function getCompanyNavItems(opts = {}) {
  void opts?.level;
  return [
    { key: 'home', labelKey: 'nav.companyHome', path: '/app/company/home', group: null },
    { key: 'chat', labelKey: 'nav.messages', path: '/app/company/chat', group: null },
    { key: 'documents', labelKey: 'nav.documents', path: '/app/company/documents', group: null },
    { key: 'calendar', labelKey: 'nav.calendar', path: '/app/company/calendar', group: null },
    { key: 'approvals', labelKey: 'nav.approvals', path: '/app/company/approvals', group: null },
  ];
}

export function getProjectsPreSelectNavItems() {
  return [
    { key: 'picker', labelKey: 'nav.projectsPick', path: '/app/projects', group: null },
    { key: 'new', labelKey: 'nav.projectsNew', path: '/app/projects/new', group: null },
  ];
}

/**
 * Full post-select catalog (all phases). Filter with deliveryPhase.
 * @param {string} projectId
 * @param {{ deliveryPhase?: string }} [opts]
 */
export function getProjectsPostSelectNavItems(projectId, opts = {}) {
  const pid = String(projectId || '').trim();
  const base = pid ? `/app/projects/${encodeURIComponent(pid)}` : '/app/projects';

  const item = (key, labelKey, module, group) => ({
    key,
    labelKey,
    path: `${base}/${module}`,
    module,
    group,
  });

  const all = [
    item('overview', 'workspace.projectHubTabOverview', 'overview', PROJECT_MENU_GROUPS.WORK),
    item(
      'customerDocuments',
      PHASE_MODULE_LABEL_KEYS['customer-documents'],
      'customer-documents',
      PROJECT_MENU_GROUPS.WORK
    ),
    item('analysisBg', PHASE_MODULE_LABEL_KEYS['analysis-bg'], 'analysis-bg', PROJECT_MENU_GROUPS.WORK),
    item('analysisBr', PHASE_MODULE_LABEL_KEYS['analysis-br'], 'analysis-br', PROJECT_MENU_GROUPS.WORK),
    item('analysisBpm', PHASE_MODULE_LABEL_KEYS['analysis-bpm'], 'analysis-bpm', PROJECT_MENU_GROUPS.WORK),
    item('analysisFr', PHASE_MODULE_LABEL_KEYS['analysis-fr'], 'analysis-fr', PROJECT_MENU_GROUPS.WORK),
    item('analysisUc', PHASE_MODULE_LABEL_KEYS['analysis-uc'], 'analysis-uc', PROJECT_MENU_GROUPS.WORK),
    item('analysisNfr', PHASE_MODULE_LABEL_KEYS['analysis-nfr'], 'analysis-nfr', PROJECT_MENU_GROUPS.WORK),
    item(
      'analysisScope',
      PHASE_MODULE_LABEL_KEYS['analysis-scope'],
      'analysis-scope',
      PROJECT_MENU_GROUPS.WORK
    ),
    item(
      'traceability',
      PHASE_MODULE_LABEL_KEYS.traceability,
      'traceability',
      PROJECT_MENU_GROUPS.WORK
    ),
    item(
      'analysisReviews',
      PHASE_MODULE_LABEL_KEYS['analysis-reviews'],
      'analysis-reviews',
      PROJECT_MENU_GROUPS.WORK
    ),
    item(
      'srsBaselines',
      PHASE_MODULE_LABEL_KEYS['srs-baselines'],
      'srs-baselines',
      PROJECT_MENU_GROUPS.WORK
    ),
    item(
      'deliveryPlanning',
      PHASE_MODULE_LABEL_KEYS['delivery-planning'],
      'delivery-planning',
      PROJECT_MENU_GROUPS.WORK
    ),
    item('list', 'workspace.projectHubTabList', 'list', PROJECT_MENU_GROUPS.WORK),
    item('planning', 'workspace.projectHubTabPlanning', 'planning', PROJECT_MENU_GROUPS.WORK),
    item('board', 'workspace.projectHubTabBoard', 'board', PROJECT_MENU_GROUPS.WORK),
    item('timeline', 'workspace.projectHubTabTimeline', 'timeline', PROJECT_MENU_GROUPS.WORK),
    item(
      'changeRequests',
      'workspace.projectHubTabChangeRequests',
      'change-requests',
      PROJECT_MENU_GROUPS.WORK
    ),
    item('requirements', 'nav.requirements', 'requirements', PROJECT_MENU_GROUPS.WORK),
    item('files', 'workspace.projectHubTabFiles', 'files', PROJECT_MENU_GROUPS.WORK),
    item('chat', 'workspace.projectHubTabChat', 'chat', PROJECT_MENU_GROUPS.COLLAB),
    item('calendar', 'nav.calendar', 'calendar', PROJECT_MENU_GROUPS.COLLAB),
    item('documents', 'nav.documents', 'documents', PROJECT_MENU_GROUPS.COLLAB),
    item('members', 'workspace.projectHubTabMembers', 'members', PROJECT_MENU_GROUPS.OPS),
    item('activity', 'workspace.projectHubTabActivity', 'activity', PROJECT_MENU_GROUPS.OPS),
    item('settings', 'workspace.projectHubTabSettings', 'settings', PROJECT_MENU_GROUPS.OPS),
  ];

  if (opts.deliveryPhase === undefined && opts.skipPhaseFilter) {
    return all;
  }
  // Default: development (legacy projects / missing field)
  return filterNavItemsByDeliveryPhase(all, opts.deliveryPhase);
}

export function getProjectMenuGroupLabelKey(group) {
  if (group === PROJECT_MENU_GROUPS.WORK) return 'nav.projectGroupWork';
  if (group === PROJECT_MENU_GROUPS.COLLAB) return 'nav.projectGroupCollab';
  if (group === PROJECT_MENU_GROUPS.OPS) return 'nav.projectGroupOps';
  return '';
}
