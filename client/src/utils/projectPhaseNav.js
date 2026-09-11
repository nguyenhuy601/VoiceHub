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
    ...COLLAB_MIN,
  ]),
  delivery_planning: Object.freeze([
    'overview',
    'srs-baselines',
    'traceability',
    'analysis-reviews',
    'delivery-planning',
    'requirements',
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
});

export const ANALYSIS_PLACEHOLDER_MODULES = Object.freeze([
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
]);

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
