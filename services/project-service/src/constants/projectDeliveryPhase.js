/**
 * Project deliveryPhase — orthogonal to Project.status lifecycle.
 * SSOT: docs/adr/0001-project-delivery-phase-and-req-analysis.md
 */

const DELIVERY_PHASES = Object.freeze([
  'requirement_analysis',
  'delivery_planning',
  'development',
  'qa_uat',
  'release_handover',
]);

/** Missing / legacy documents → keep Development hub UX */
const DEFAULT_DELIVERY_PHASE_EXISTING = 'development';

/** New Project.create default */
const DEFAULT_DELIVERY_PHASE_NEW = 'requirement_analysis';

const PHASE_HOME_MODULE = Object.freeze({
  requirement_analysis: 'overview',
  delivery_planning: 'overview',
  development: 'overview',
  qa_uat: 'overview',
  release_handover: 'overview',
});

/**
 * Modules allowed per deliveryPhase.
 * development = current suite post-select menu 1:1.
 */
const DEVELOPMENT_MODULES = Object.freeze([
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

const COLLAB_MIN = Object.freeze(['chat', 'calendar', 'documents', 'settings', 'members']);

const REQUIREMENT_ANALYSIS_MODULES = Object.freeze([
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
]);

const DELIVERY_PLANNING_MODULES = Object.freeze([
  'overview',
  'customer-baselines',
  'traceability',
  'analysis-reviews',
  'customer-planning',
  'requirements',
  'planning',
  'timeline',
  ...COLLAB_MIN,
  'activity',
]);

const QA_UAT_MODULES = Object.freeze([
  'overview',
  'list',
  'board',
  'files',
  ...COLLAB_MIN,
  'activity',
]);

const RELEASE_HANDOVER_MODULES = Object.freeze([
  'overview',
  'files',
  ...COLLAB_MIN,
  'activity',
]);

const PHASE_NAV_MODULES = Object.freeze({
  requirement_analysis: REQUIREMENT_ANALYSIS_MODULES,
  delivery_planning: DELIVERY_PLANNING_MODULES,
  development: DEVELOPMENT_MODULES,
  qa_uat: QA_UAT_MODULES,
  release_handover: RELEASE_HANDOVER_MODULES,
});

/** Adjacent transitions (PM may move ±1 or any — MVP allow any known phase) */
const DELIVERY_PHASE_TRANSITIONS = Object.freeze({
  requirement_analysis: ['delivery_planning', 'development'],
  delivery_planning: ['requirement_analysis', 'development', 'qa_uat'],
  development: ['delivery_planning', 'qa_uat', 'requirement_analysis'],
  qa_uat: ['development', 'release_handover', 'delivery_planning'],
  release_handover: ['qa_uat', 'development'],
});

function coerceDeliveryPhase(raw, { missingAsExisting = true } = {}) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value) {
    return missingAsExisting ? DEFAULT_DELIVERY_PHASE_EXISTING : DEFAULT_DELIVERY_PHASE_NEW;
  }
  if (DELIVERY_PHASES.includes(value)) return value;
  return null;
}

function isModuleAllowedForPhase(moduleKey, deliveryPhase) {
  const phase = coerceDeliveryPhase(deliveryPhase) || DEFAULT_DELIVERY_PHASE_EXISTING;
  const allowed = PHASE_NAV_MODULES[phase] || DEVELOPMENT_MODULES;
  const mod = String(moduleKey || '')
    .trim()
    .toLowerCase();
  return allowed.includes(mod);
}

function phaseHomeModule(deliveryPhase) {
  const phase = coerceDeliveryPhase(deliveryPhase) || DEFAULT_DELIVERY_PHASE_EXISTING;
  return PHASE_HOME_MODULE[phase] || 'overview';
}

function canTransitionDeliveryPhase(from, to) {
  const a = coerceDeliveryPhase(from);
  const b = coerceDeliveryPhase(to, { missingAsExisting: false });
  if (!a || !b) return false;
  if (a === b) return true;
  const next = DELIVERY_PHASE_TRANSITIONS[a] || [];
  return next.includes(b);
}

module.exports = {
  DELIVERY_PHASES,
  DEFAULT_DELIVERY_PHASE_EXISTING,
  DEFAULT_DELIVERY_PHASE_NEW,
  PHASE_HOME_MODULE,
  DEVELOPMENT_MODULES,
  REQUIREMENT_ANALYSIS_MODULES,
  DELIVERY_PLANNING_MODULES,
  QA_UAT_MODULES,
  RELEASE_HANDOVER_MODULES,
  PHASE_NAV_MODULES,
  DELIVERY_PHASE_TRANSITIONS,
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  phaseHomeModule,
  canTransitionDeliveryPhase,
};
