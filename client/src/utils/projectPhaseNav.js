/**
 * FE mirror of project-service deliveryPhase nav matrix.
 * Keep in sync with services/project-service/src/constants/projectDeliveryPhase.js
 */

export const DELIVERY_PHASES = Object.freeze([
  'requirement_analysis',
  'delivery_planning',
  'development',
  'qa_uat',
  'release_handover',
]);

export const DEFAULT_DELIVERY_PHASE_EXISTING = 'development';

const COLLAB_MIN = ['chat', 'calendar', 'documents', 'settings', 'members'];

export const DEVELOPMENT_MODULES = Object.freeze([
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
]);

export const PLANNING_SUBMODULES = Object.freeze([
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
  'planning/overview',
  'planning/wbs',
  'planning/architecture',
  'planning/resources',
  'planning/dependencies',
  'planning/schedule',
  'planning/milestones',
  'planning/releases',
  'planning/risks',
  'planning/approval',
]);

export const PHASE_NAV_MODULES = Object.freeze({
  requirement_analysis: Object.freeze([
    'overview',
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
    'requirements',
    ...PLANNING_SUBMODULES,
    ...COLLAB_MIN,
  ]),
  delivery_planning: Object.freeze([
    'overview',
    'customer-documents',
    'analysis-bg',
    'analysis-br',
    'analysis-bpm',
    'analysis-fr',
    'analysis-uc',
    'analysis-nfr',
    'analysis-scope',
    'srs-baselines',
    'traceability',
    'analysis-reviews',
    'delivery-planning',
    'requirements',
    ...PLANNING_SUBMODULES,
    'planning',
    'timeline',
    ...COLLAB_MIN,
    'activity',
  ]),
  development: DEVELOPMENT_MODULES,
  qa_uat: Object.freeze([
    'overview',
    'list',
    'board',
    'files',
    ...COLLAB_MIN,
    'activity',
  ]),
  release_handover: Object.freeze(['overview', 'files', ...COLLAB_MIN, 'activity']),
});

export const PHASE_MODULE_LABEL_KEYS = Object.freeze({
  'customer-documents': 'workspace.phaseNavCustomerDocuments',
  'analysis-bg': 'workspace.phaseNavAnalysisBg',
  'analysis-br': 'workspace.phaseNavAnalysisBr',
  'analysis-bpm': 'workspace.phaseNavAnalysisBpm',
  'analysis-fr': 'workspace.phaseNavAnalysisFr',
  'analysis-uc': 'workspace.phaseNavAnalysisUc',
  'analysis-nfr': 'workspace.phaseNavAnalysisNfr',
  'analysis-scope': 'workspace.phaseNavAnalysisScope',
  traceability: 'workspace.phaseNavTraceability',
  'analysis-reviews': 'workspace.phaseNavAnalysisReviews',
  'srs-baselines': 'workspace.phaseNavSrsBaselines',
  'delivery-planning': 'workspace.phaseNavDeliveryPlanning',
  'planning-overview': 'workspace.phaseNavPlanningOverview',
  'planning-wbs': 'workspace.phaseNavPlanningWbs',
  'planning-architecture': 'workspace.phaseNavPlanningArchitecture',
  'planning-resources': 'workspace.phaseNavPlanningResources',
  'planning-dependencies': 'workspace.phaseNavPlanningDependencies',
  'planning-schedule': 'workspace.phaseNavPlanningSchedule',
  'planning-milestones': 'workspace.phaseNavPlanningMilestones',
  'planning-releases': 'workspace.phaseNavPlanningReleases',
  'planning-risks': 'workspace.phaseNavPlanningRisks',
  'planning-approval': 'workspace.phaseNavPlanningApproval',
});

/** Modules that still fall back to placeholder if Phase1Shell not used */
export const ANALYSIS_PLACEHOLDER_MODULES = Object.freeze([]);

export function coerceDeliveryPhase(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value) return DEFAULT_DELIVERY_PHASE_EXISTING;
  if (DELIVERY_PHASES.includes(value)) return value;
  return DEFAULT_DELIVERY_PHASE_EXISTING;
}

export function isModuleAllowedForPhase(moduleKey, deliveryPhase) {
  const phase = coerceDeliveryPhase(deliveryPhase);
  const allowed = PHASE_NAV_MODULES[phase] || DEVELOPMENT_MODULES;
  const mod = String(moduleKey || '')
    .trim()
    .toLowerCase();
  return allowed.includes(mod);
}

export function phaseHomeModule(deliveryPhase) {
  const phase = coerceDeliveryPhase(deliveryPhase);
  if (phase === 'development' || phase === 'qa_uat') return 'board';
  return 'overview';
}

export function deliveryPhaseLabelKey(deliveryPhase) {
  const phase = coerceDeliveryPhase(deliveryPhase);
  return `workspace.deliveryPhase_${phase}`;
}

export function filterNavItemsByDeliveryPhase(items, deliveryPhase) {
  const phase = coerceDeliveryPhase(deliveryPhase);
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => isModuleAllowedForPhase(item.module || item.key, phase));
}

/**
 * Modules gated by capabilities.canViewAnalysis.
 * Caps are role-backed (Project Role key → projectPermissionMatrix), not org Permission Group.
 */
export const ANALYSIS_VIEW_MODULES = Object.freeze([
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
]);

/**
 * Modules gated by capabilities.canViewPlanning (same role-backed source as analysis).
 * (planning hub backlog tab uses canViewBacklog — separate).
 */
export function isPlanningViewModule(moduleKey) {
  const mod = String(moduleKey || '')
    .trim()
    .toLowerCase();
  if (!mod) return false;
  if (mod === 'delivery-planning') return true;
  if (mod.startsWith('planning-') || mod.startsWith('planning/')) return true;
  return false;
}

export function isAnalysisViewModule(moduleKey) {
  const mod = String(moduleKey || '')
    .trim()
    .toLowerCase();
  return ANALYSIS_VIEW_MODULES.includes(mod);
}

/**
 * Lock (do not drop) analysis/planning nav when view caps are false.
 * Caps come from BE Project Role matrix (PO/BA/…), not org Permission packs.
 * When capabilities is null/undefined, skip (caller not ready / legacy).
 * Fail-closed when capabilities object is present: items stay visible but locked.
 */
export const PHASE1_ANALYSIS_CAP_LOCK_HINT_KEY = 'workspace.phase1AnalysisCapLockedHint';
export const PHASE1_PLANNING_CAP_LOCK_HINT_KEY = 'workspace.phase1PlanningCapLockedHint';

export function filterNavItemsByCapabilities(items, capabilities) {
  if (capabilities == null || typeof capabilities !== 'object') {
    return Array.isArray(items) ? items : [];
  }
  const canViewAnalysis = Boolean(capabilities.canViewAnalysis);
  const canViewPlanning = Boolean(capabilities.canViewPlanning);
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    const mod = String(item.module || item.key || '')
      .trim()
      .toLowerCase();
    let next = item;
    if (isAnalysisViewModule(mod) && !canViewAnalysis) {
      next = {
        ...next,
        locked: true,
        lockHintKey: next.lockHintKey || PHASE1_ANALYSIS_CAP_LOCK_HINT_KEY,
      };
    }
    if (isPlanningViewModule(mod) && !canViewPlanning) {
      next = {
        ...next,
        locked: true,
        // Prefer existing phase-lock hint when already locked by delivery phase.
        lockHintKey: next.locked && next.lockHintKey
          ? next.lockHintKey
          : PHASE1_PLANNING_CAP_LOCK_HINT_KEY,
      };
    }
    return next;
  });
}

export function isPhase1DeliveryPhase(deliveryPhase) {
  const p = coerceDeliveryPhase(deliveryPhase);
  return p === 'requirement_analysis' || p === 'delivery_planning';
}
