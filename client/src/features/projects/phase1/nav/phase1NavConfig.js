/**
 * Phase 1 UX nav SSOT — 2 nested groups under one Phase 1 workspace.
 * BE deliveryPhase remains requirement_analysis | delivery_planning.
 */

export const PHASE1_RA_MODULES = Object.freeze([
  { key: 'overview', module: 'overview', labelKey: 'workspace.projectHubTabOverview', pathSeg: 'overview' },
  {
    key: 'customer-documents',
    module: 'customer-documents',
    labelKey: 'workspace.phaseNavCustomerDocuments',
    pathSeg: 'customer-documents',
  },
  { key: 'analysis-scope', module: 'analysis-scope', labelKey: 'workspace.phaseNavAnalysisScope', pathSeg: 'analysis-scope' },
  { key: 'analysis-bg', module: 'analysis-bg', labelKey: 'workspace.phaseNavAnalysisBg', pathSeg: 'analysis-bg' },
  { key: 'analysis-br', module: 'analysis-br', labelKey: 'workspace.phaseNavAnalysisBr', pathSeg: 'analysis-br' },
  { key: 'analysis-bpm', module: 'analysis-bpm', labelKey: 'workspace.phaseNavAnalysisBpm', pathSeg: 'analysis-bpm' },
  { key: 'analysis-fr', module: 'analysis-fr', labelKey: 'workspace.phaseNavAnalysisFr', pathSeg: 'analysis-fr' },
  { key: 'analysis-uc', module: 'analysis-uc', labelKey: 'workspace.phaseNavAnalysisUc', pathSeg: 'analysis-uc' },
  { key: 'analysis-nfr', module: 'analysis-nfr', labelKey: 'workspace.phaseNavAnalysisNfr', pathSeg: 'analysis-nfr' },
  {
    key: 'analysis-interface',
    module: 'analysis-interface',
    labelKey: 'workspace.phaseNavAnalysisInterface',
    pathSeg: 'analysis-interface',
  },
  {
    key: 'analysis-data',
    module: 'analysis-data',
    labelKey: 'workspace.phaseNavAnalysisData',
    pathSeg: 'analysis-data',
  },
  {
    key: 'analysis-glossary',
    module: 'analysis-glossary',
    labelKey: 'workspace.phaseNavAnalysisGlossary',
    pathSeg: 'analysis-glossary',
  },
  {
    key: 'analysis-assumption',
    module: 'analysis-assumption',
    labelKey: 'workspace.phaseNavAnalysisAssumption',
    pathSeg: 'analysis-assumption',
  },
  { key: 'traceability', module: 'traceability', labelKey: 'workspace.phaseNavTraceability', pathSeg: 'traceability' },
  { key: 'srs-baselines', module: 'srs-baselines', labelKey: 'workspace.phaseNavSrsBaselines', pathSeg: 'srs-baselines' },
  {
    key: 'analysis-reviews',
    module: 'analysis-reviews',
    labelKey: 'workspace.phaseNavAnalysisReviews',
    pathSeg: 'analysis-reviews',
  },
]);

export const PHASE1_PLANNING_MODULES = Object.freeze([
  {
    key: 'planning-overview',
    module: 'planning-overview',
    labelKey: 'workspace.phaseNavPlanningOverview',
    pathSeg: 'planning/overview',
  },
  { key: 'planning-wbs', module: 'planning-wbs', labelKey: 'workspace.phaseNavPlanningWbs', pathSeg: 'planning/wbs' },
  {
    key: 'planning-architecture',
    module: 'planning-architecture',
    labelKey: 'workspace.phaseNavPlanningArchitecture',
    pathSeg: 'planning/architecture',
  },
  {
    key: 'planning-resources',
    module: 'planning-resources',
    labelKey: 'workspace.phaseNavPlanningResources',
    pathSeg: 'planning/resources',
  },
  {
    key: 'planning-dependencies',
    module: 'planning-dependencies',
    labelKey: 'workspace.phaseNavPlanningDependencies',
    pathSeg: 'planning/dependencies',
  },
  {
    key: 'planning-schedule',
    module: 'planning-schedule',
    labelKey: 'workspace.phaseNavPlanningSchedule',
    pathSeg: 'planning/schedule',
  },
  {
    key: 'planning-milestones',
    module: 'planning-milestones',
    labelKey: 'workspace.phaseNavPlanningMilestones',
    pathSeg: 'planning/milestones',
  },
  {
    key: 'planning-releases',
    module: 'planning-releases',
    labelKey: 'workspace.phaseNavPlanningReleases',
    pathSeg: 'planning/releases',
  },
  { key: 'planning-risks', module: 'planning-risks', labelKey: 'workspace.phaseNavPlanningRisks', pathSeg: 'planning/risks' },
  {
    key: 'planning-test-cases',
    module: 'planning-test-cases',
    labelKey: 'workspace.phaseNavPlanningTestCases',
    pathSeg: 'planning/test-cases',
  },
  {
    key: 'planning-approval',
    module: 'planning-approval',
    labelKey: 'workspace.phaseNavPlanningApproval',
    pathSeg: 'planning/approval',
  },
]);

export const PHASE1_COLLAB_MODULES = Object.freeze([
  { key: 'chat', module: 'chat', labelKey: 'workspace.projectHubTabChat', pathSeg: 'chat', group: 'collab' },
  { key: 'calendar', module: 'calendar', labelKey: 'nav.calendar', pathSeg: 'calendar', group: 'collab' },
  { key: 'documents', module: 'documents', labelKey: 'nav.documents', pathSeg: 'documents', group: 'collab' },
  { key: 'members', module: 'members', labelKey: 'workspace.projectHubTabMembers', pathSeg: 'members', group: 'ops' },
  { key: 'settings', module: 'settings', labelKey: 'workspace.projectHubTabSettings', pathSeg: 'settings', group: 'ops' },
]);

/** Map URL segment → canonical module key */
export const PLANNING_SUB_TO_MODULE = Object.freeze({
  overview: 'planning-overview',
  wbs: 'planning-wbs',
  architecture: 'planning-architecture',
  resources: 'planning-resources',
  dependencies: 'planning-dependencies',
  schedule: 'planning-schedule',
  milestones: 'planning-milestones',
  releases: 'planning-releases',
  risks: 'planning-risks',
  'test-cases': 'planning-test-cases',
  approval: 'planning-approval',
});

export const ARTIFACT_KIND_BY_MODULE = Object.freeze({
  'analysis-bg': 'BG',
  'analysis-br': 'BR',
  'analysis-bpm': 'BPM',
  'analysis-fr': 'FR',
  'analysis-uc': 'UC',
  'analysis-nfr': 'NFR',
  'analysis-scope': 'SCOPE',
  'analysis-interface': 'INTERFACE',
  'analysis-data': 'DATA',
  'analysis-glossary': 'GLOSSARY',
  'analysis-assumption': 'ASSUMPTION',
});

export const PLANNING_KIND_BY_MODULE = Object.freeze({
  'planning-wbs': 'WBS',
  'planning-architecture': 'ARCHITECTURE',
  'planning-resources': 'RESOURCE',
  'planning-dependencies': 'DEPENDENCY',
  'planning-schedule': 'SCHEDULE',
  'planning-milestones': 'MILESTONE',
  'planning-releases': 'RELEASE',
  'planning-risks': 'RISK',
});

export function isPhase1DeliveryPhase(deliveryPhase) {
  const p = String(deliveryPhase || '')
    .trim()
    .toLowerCase();
  return p === 'requirement_analysis' || p === 'delivery_planning';
}

export function isPlanningUnlocked(deliveryPhase) {
  return String(deliveryPhase || '')
    .trim()
    .toLowerCase() === 'delivery_planning';
}

/**
 * @param {string} projectId
 * @param {string} pathSeg module path segment (may include planning/wbs)
 * @param {{ organizationId?: string, boardId?: string, artifact?: string }} [query]
 */
export function buildPhase1ModulePath(projectId, pathSeg, query = {}) {
  const pid = String(projectId || '').trim();
  const seg = String(pathSeg || 'overview').replace(/^\/+/, '');
  const base = `/app/projects/${encodeURIComponent(pid)}/${seg}`;
  const params = new URLSearchParams();
  // organizationId omitted from Phase 1 module URLs (resolve via project hub payload).
  const boardId = String(query.boardId || '').trim();
  if (boardId) params.set('boardId', boardId);
  const artifact = String(query.artifact || query.artifactId || '').trim();
  if (artifact) params.set('artifact', artifact);
  const sourceUcKey = String(query.sourceUcKey || query.uc || '').trim();
  if (sourceUcKey) params.set('sourceUcKey', sourceUcKey);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function getPhase1SidebarGroups({ planningLocked = true, raReadOnly = false } = {}) {
  const raItems = raReadOnly
    ? PHASE1_RA_MODULES.filter((m) => m.key === 'srs-baselines' || m.key === 'overview')
    : PHASE1_RA_MODULES;
  return [
    {
      id: 'requirement_analysis',
      labelKey: 'workspace.phase1GroupRequirementAnalysis',
      locked: false,
      /** After Start Planning: chỉ Overview + SRS Baseline (DEC P1-H). */
      readOnly: Boolean(raReadOnly),
      readOnlyHintKey: 'workspace.phase1RaReadOnlyNavHint',
      items: raItems,
    },
    {
      id: 'planning',
      labelKey: 'workspace.phase1GroupPlanning',
      locked: Boolean(planningLocked),
      lockHintKey: 'workspace.phase1PlanningLockedHint',
      items: PHASE1_PLANNING_MODULES,
    },
  ];
}
