/**
 * Suite sidebar nav config — Company (fixed) + Projects (pre/post select).
 * Groups: work | collab | ops | phase1_ra | phase1_planning
 * Post-select menu filtered by Project.deliveryPhase via projectPhaseNav.
 */

import {
  filterNavItemsByCapabilities,
  filterNavItemsByDeliveryPhase,
  PHASE_MODULE_LABEL_KEYS,
  isPhase1DeliveryPhase,
} from './projectPhaseNav.js';
import {
  PHASE1_COLLAB_MODULES,
  PHASE1_PLANNING_MODULES,
  PHASE1_RA_MODULES,
  getPhase1SidebarGroups,
  isPlanningUnlocked,
} from '../features/projects/phase1/nav/phase1NavConfig.js';

export const PROJECT_MENU_GROUPS = {
  WORK: 'work',
  COLLAB: 'collab',
  OPS: 'ops',
  PHASE1_RA: 'phase1_ra',
  PHASE1_PLANNING: 'phase1_planning',
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
  'planning-overview',
  'planning-wbs',
  'planning-architecture',
  'planning-resources',
  'planning-dependencies',
  'planning-schedule',
  'planning-milestones',
  'planning-releases',
  'planning-risks',
  'planning-approval',
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
  if (lower.startsWith('planning-')) return lower;
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
 * Full post-select catalog (all phases). Filter with deliveryPhase + capabilities.
 * Phase 1 uses nested RA + Planning groups.
 * @param {string} projectId
 * @param {{ deliveryPhase?: string, capabilities?: object|null, skipPhaseFilter?: boolean }} [opts]
 */
export function getProjectsPostSelectNavItems(projectId, opts = {}) {
  const pid = String(projectId || '').trim();
  const base = pid ? `/app/projects/${encodeURIComponent(pid)}` : '/app/projects';
  const deliveryPhase = opts.deliveryPhase;
  const capabilities = opts.capabilities;

  const item = (key, labelKey, module, group, pathSeg) => ({
    key,
    labelKey,
    path: `${base}/${pathSeg || module}`,
    module,
    group,
    pathSeg: pathSeg || module,
  });

  const applyCapabilityFilter = (items) =>
    filterNavItemsByCapabilities(items, capabilities);

  if (isPhase1DeliveryPhase(deliveryPhase)) {
    const planningLocked = !isPlanningUnlocked(deliveryPhase);
    const groups = getPhase1SidebarGroups({ planningLocked });
    const phase1Items = [];
    for (const g of groups) {
      const groupId =
        g.id === 'planning' ? PROJECT_MENU_GROUPS.PHASE1_PLANNING : PROJECT_MENU_GROUPS.PHASE1_RA;
      for (const m of g.items) {
        phase1Items.push({
          ...item(m.key, m.labelKey, m.module, groupId, m.pathSeg),
          locked: Boolean(g.locked),
          lockHintKey: g.lockHintKey,
        });
      }
    }
    for (const m of PHASE1_COLLAB_MODULES) {
      phase1Items.push(
        item(
          m.key,
          m.labelKey,
          m.module,
          m.group === 'ops' ? PROJECT_MENU_GROUPS.OPS : PROJECT_MENU_GROUPS.COLLAB
        )
      );
    }
    return applyCapabilityFilter(phase1Items);
  }

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
    return applyCapabilityFilter(all);
  }
  return applyCapabilityFilter(filterNavItemsByDeliveryPhase(all, opts.deliveryPhase));
}

export function getProjectMenuGroupLabelKey(group) {
  if (group === PROJECT_MENU_GROUPS.WORK) return 'nav.projectGroupWork';
  if (group === PROJECT_MENU_GROUPS.COLLAB) return 'nav.projectGroupCollab';
  if (group === PROJECT_MENU_GROUPS.OPS) return 'nav.projectGroupOps';
  if (group === PROJECT_MENU_GROUPS.PHASE1_RA) return 'workspace.phase1GroupRequirementAnalysis';
  if (group === PROJECT_MENU_GROUPS.PHASE1_PLANNING) return 'workspace.phase1GroupPlanning';
  return '';
}

export { PHASE1_RA_MODULES, PHASE1_PLANNING_MODULES };
