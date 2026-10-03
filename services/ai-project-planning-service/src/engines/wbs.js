/**
 * WBS generation — deterministic 1 task per capability + AREA_ROLE_HINT.
 */

const AREA_ROLE_HINT = Object.freeze({
  frontend: 'frontend_developer',
  backend: 'backend_developer',
  database: 'backend_developer',
  api: 'backend_developer',
  auth: 'backend_developer',
  infrastructure: 'devops_engineer',
  external: 'backend_developer',
  security: 'backend_developer',
  deployment: 'devops_engineer',
  qa: 'qa_engineer',
  design: 'ui_ux_designer',
  management: 'project_manager',
  analysis: 'business_analyst',
});

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function inferAreaFromCapability(cap) {
  const blob = `${cap.name || ''} ${cap.module || ''} ${(cap.requiredSkills || [])
    .map((s) => (typeof s === 'string' ? s : s.name || ''))
    .join(' ')}`.toLowerCase();
  if (/front|react|ui|css|html|ux/.test(blob)) return 'frontend';
  if (/qa|test|selenium/.test(blob)) return 'qa';
  if (/devops|deploy|infra|k8s|docker/.test(blob)) return 'infrastructure';
  if (/design|figma|wireframe/.test(blob)) return 'design';
  if (/auth|oauth|jwt|security/.test(blob)) return 'auth';
  if (/db|sql|mongo|data model/.test(blob)) return 'database';
  if (/api|rest|graphql|endpoint/.test(blob)) return 'api';
  if (/manage|plan|scrum|pm/.test(blob)) return 'management';
  if (/analy|ba |business/.test(blob)) return 'analysis';
  return 'backend';
}

function buildHeuristicWbsTasks(capabilities = []) {
  const tasks = [];
  let sortOrder = 0;
  for (const cap of capabilities || []) {
    if (!cap?.capabilityId) continue;
    const area = inferAreaFromCapability(cap);
    const role = AREA_ROLE_HINT[area] || 'backend_developer';
    const base = slugPart(cap.capabilityId) || slugPart(cap.name) || 'cap';
    tasks.push({
      id: `TASK-${base}`,
      name: cap.name || cap.capabilityId,
      area,
      sourceCapabilityIds: [cap.capabilityId],
      sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
      suggestedRoleKey: role,
      sortOrder,
    });
    sortOrder += 1;
  }
  return tasks;
}

function runWbsEngine(container = {}) {
  const capabilities = container?.analyses?.capability?.items || [];
  const tasks = buildHeuristicWbsTasks(capabilities);
  const wbs = {
    roots: tasks.map((t) => t.id),
    nodes: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId || null,
      area: t.area,
    })),
    taskCount: tasks.length,
  };
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    tasks,
    wbs,
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      capabilityCount: capabilities.length,
      taskCount: tasks.length,
    },
  };
}

function applyWbsToContainer(container, wbsResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.tasks = Array.isArray(wbsResult.tasks) ? wbsResult.tasks : [];
  next.planning.wbs = wbsResult.wbs || {
    roots: [],
    nodes: [],
    taskCount: next.planning.tasks.length,
  };
  return next;
}

module.exports = {
  AREA_ROLE_HINT,
  inferAreaFromCapability,
  buildHeuristicWbsTasks,
  runWbsEngine,
  applyWbsToContainer,
};
