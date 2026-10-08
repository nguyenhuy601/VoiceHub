/**
 * Phase 1 UX nav SSOT — nested groups under one Phase 1 workspace.
 * Optional Phase 0 (AI HITL) when aiHitlIncomplete.
 * BE deliveryPhase remains requirement_analysis | delivery_planning.
 */

/** Phase 0 — AI HITL Monitor & Duyệt (AI drafts only). */
export const PHASE1_AI_HITL_MODULES = Object.freeze([
  {
    key: 'ai-hitl',
    module: 'ai-hitl',
    labelKey: 'workspace.phaseNavAiHitl',
    pathSeg: 'ai-hitl',
  },
]);

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
    /** Staffing pipeline — 5 tab con under「Kế hoạch nguồn lực」(no sibling nav). */
    children: [
      {
        key: 'planning-resources-wbs',
        module: 'planning-resources',
        labelKey: 'workspace.phaseNavPlanningResourcesWbs',
        pathSeg: 'planning/resources/wbs',
      },
      {
        key: 'planning-resources-effort',
        module: 'planning-resources',
        labelKey: 'workspace.phaseNavPlanningResourcesEffort',
        pathSeg: 'planning/resources/effort',
      },
      {
        key: 'planning-resources-match',
        module: 'planning-resources',
        labelKey: 'workspace.phaseNavPlanningResourcesMatch',
        pathSeg: 'planning/resources/match',
      },
      {
        key: 'planning-resources-capacity',
        module: 'planning-resources',
        labelKey: 'workspace.phaseNavPlanningResourcesCapacity',
        pathSeg: 'planning/resources/capacity',
      },
      {
        key: 'planning-resources-schedule',
        module: 'planning-resources',
        labelKey: 'workspace.phaseNavPlanningResourcesSchedule',
        pathSeg: 'planning/resources/schedule',
      },
    ],
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

/** Staffing step segment under planning/resources/* */
export const PLANNING_RESOURCES_STEPS = Object.freeze([
  'wbs',
  'effort',
  'match',
  'capacity',
  'schedule',
]);

export function resolvePlanningResourcesStep(splatOrStep) {
  const raw = String(splatOrStep || '')
    .trim()
    .toLowerCase()
    .split('/')
    .filter(Boolean)[0];
  if (PLANNING_RESOURCES_STEPS.includes(raw)) return raw;
  return 'wbs';
}

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
  const packId = String(query.packId || '').trim();
  if (packId) params.set('packId', packId);
  if (query.startWhat === true || query.startWhat === 1 || query.startWhat === '1') {
    params.set('startWhat', '1');
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function getPhase1SidebarGroups({
  planningLocked = true,
  raReadOnly = false,
  aiHitlIncomplete = false,
} = {}) {
  // Phase 0: chỉ AI HITL — không hiện RA/Planning bị mờ/khóa.
  if (aiHitlIncomplete) {
    return [
      {
        id: 'ai_hitl',
        labelKey: 'workspace.phase0GroupAiHitl',
        locked: false,
        items: PHASE1_AI_HITL_MODULES,
      },
    ];
  }

  const raItems = raReadOnly
    ? PHASE1_RA_MODULES.filter((m) => m.key === 'srs-baselines' || m.key === 'overview')
    : PHASE1_RA_MODULES;
  const groups = [
    {
      id: 'requirement_analysis',
      labelKey: 'workspace.phase1GroupRequirementAnalysis',
      locked: false,
      /** After Start Planning: chỉ Overview + SRS Baseline (DEC P1-H). */
      readOnly: Boolean(raReadOnly),
      readOnlyHintKey: 'workspace.phase1RaReadOnlyNavHint',
      items: raItems,
    },
  ];
  // Planning chỉ hiện khi đã Start Planning — không hiện nhóm khóa trong RA.
  if (!planningLocked) {
    groups.push({
      id: 'planning',
      labelKey: 'workspace.phase1GroupPlanning',
      locked: false,
      items: PHASE1_PLANNING_MODULES,
    });
  }
  return groups;
}
