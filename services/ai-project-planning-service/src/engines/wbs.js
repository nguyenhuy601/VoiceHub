/**
 * WBS generation — LLM-only task leaves under planning.backlog (no hierarchy heuristic).
 */

const { proposeWbsTasksWithLlm, isHowWbsLlmEnabled } = require('./wbsProposeLlm');
const { backlogNodesAsTasks } = require('./backlogMap');

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

/** Whitelist only — never persist legacy hierarchy_chunked / queue meta keys. */
const WBS_META_KEYS = Object.freeze([
  'source',
  'decompositionOutcome',
  'fallbackReason',
  'reasonCodes',
  'unresolvedStoryIds',
  'uncoveredFrIds',
  'uncoveredAcKeys',
  'llmCalls',
  'llmMs',
  'model',
  'promptChars',
  'storyCount',
  'leafCount',
  'taskCount',
  'chunks',
  'ctxItems',
]);

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function inferAreaFromCapability(cap) {
  const blob = `${cap?.name || ''} ${cap?.module || ''} ${(cap?.requiredSkills || [])
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

function sanitizeWbsMeta(meta = {}) {
  const src = meta && typeof meta === 'object' ? meta : {};
  const out = {};
  for (const key of WBS_META_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  if (!out.source) out.source = 'llm_failed';
  if (out.llmCalls == null) out.llmCalls = 0;
  if (!out.decompositionOutcome) {
    out.decompositionOutcome =
      out.source === 'llm_story_tasks' || out.source === 'llm_story_tasks_chunked'
        ? 'success'
        : 'failure';
  }
  return out;
}

function failClosedResult(meta = {}) {
  return {
    status: 'error',
    model: meta.model || null,
    generatedAt: new Date().toISOString(),
    tasks: [],
    wbs: { roots: [], nodes: [], taskCount: 0 },
    meta: sanitizeWbsMeta({
      source: 'llm_failed',
      llmCalls: meta.llmCalls || 0,
      ...meta,
      decompositionOutcome: meta.decompositionOutcome || 'failure',
    }),
  };
}

function llmSuccessResult(llmOut) {
  return {
    status: 'ready',
    model: llmOut.meta?.model || null,
    generatedAt: new Date().toISOString(),
    tasks: llmOut.tasks,
    wbs: llmOut.wbs,
    meta: sanitizeWbsMeta({
      ...llmOut.meta,
      source: llmOut.meta?.source || 'llm_story_tasks',
      decompositionOutcome:
        llmOut.meta?.decompositionOutcome || 'success',
      taskCount: llmOut.tasks?.length || 0,
      leafCount: llmOut.wbs?.taskCount ?? 0,
    }),
  };
}

/**
 * Sync path — LLM-only product path; sync without LLM returns fail-closed (no hierarchy).
 */
function runWbsEngine(container = {}, opts = {}) {
  const backlog = container?.planning?.backlog || opts.backlog || null;
  if (!backlog?.stories?.length) {
    return failClosedResult({
      fallbackReason: 'empty_backlog_stories',
      reasonCodes: ['empty_backlog_stories'],
    });
  }
  const tasks = backlogNodesAsTasks(backlog);
  return {
    status: 'error',
    model: null,
    generatedAt: new Date().toISOString(),
    tasks,
    wbs: {
      roots: tasks.filter((t) => !t.parentId).map((t) => t.id),
      nodes: tasks,
      taskCount: 0,
    },
    meta: sanitizeWbsMeta({
      source: 'llm_failed',
      decompositionOutcome: 'failure',
      fallbackReason: 'sync_path_requires_async_llm',
      reasonCodes: ['sync_path_requires_async_llm'],
      llmCalls: 0,
    }),
  };
}

/**
 * LLM-only async. No hierarchy / queue fallback (product path = in-process story propose).
 *
 * @param {object} container
 * @param {{ pack?: object, planningHints?: object, env?: object, generateJsonFn?: Function, runId?: string, generationId?: string, contextPackage?: object|null }} opts
 */
async function runWbsEngineAsync(container = {}, opts = {}) {
  const pack = opts.pack || container?.pack || {};
  const env = opts.env || process.env;
  const backlog = container?.planning?.backlog || opts.backlog || null;
  const contextPackage =
    opts.contextPackage || container?.contextPackage || null;

  if (!backlog || !Array.isArray(backlog.stories) || !backlog.stories.length) {
    console.error('[how-wbs] fail-closed empty_backlog_stories');
    return failClosedResult({
      fallbackReason: 'empty_backlog_stories',
      reasonCodes: ['empty_backlog_stories'],
    });
  }

  function backlogContainersOnly(extraMeta = {}) {
    const containers = backlogNodesAsTasks(backlog);
    return {
      status: 'error',
      model: null,
      generatedAt: new Date().toISOString(),
      tasks: containers,
      wbs: {
        roots: containers.filter((t) => !t.parentId).map((t) => t.id),
        nodes: containers,
        taskCount: 0,
      },
      meta: sanitizeWbsMeta({
        source: 'llm_failed',
        llmCalls: 0,
        taskCount: containers.length,
        leafCount: 0,
        ...extraMeta,
        decompositionOutcome: extraMeta.decompositionOutcome || 'failure',
      }),
    };
  }

  if (!isHowWbsLlmEnabled(env)) {
    console.error('[how-wbs] fail-closed LLM_disabled');
    return backlogContainersOnly({
      fallbackReason: 'HOW_WBS_LLM_or_runtime_off',
      reasonCodes: ['HOW_WBS_LLM_or_runtime_off'],
    });
  }

  const llmOut = await proposeWbsTasksWithLlm({
    backlog,
    pack,
    contextPackage,
    env,
    generateJsonFn: opts.generateJsonFn,
  });

  if (llmOut.ok && Array.isArray(llmOut.tasks) && llmOut.wbs) {
    return llmSuccessResult(llmOut);
  }

  console.error(
    '[how-wbs] fail-closed',
    llmOut.meta?.fallbackReason || 'llm_failed',
    (llmOut.meta?.reasonCodes || []).join(';')
  );
  const failed = backlogContainersOnly({
    ...llmOut.meta,
    llmCalls: llmOut.meta?.llmCalls || 0,
  });
  failed.model = llmOut.meta?.model || null;
  return failed;
}

function applyWbsToContainer(container, wbsResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.tasks = Array.isArray(wbsResult.tasks) ? wbsResult.tasks : [];
  const baseWbs = wbsResult.wbs || {
    roots: [],
    nodes: [],
    taskCount: 0,
  };
  // Replace wbs wholesale — no deep-merge with prior hierarchy_chunked meta
  next.planning.wbs = {
    roots: Array.isArray(baseWbs.roots) ? baseWbs.roots : [],
    nodes: Array.isArray(baseWbs.nodes) ? baseWbs.nodes : [],
    taskCount: Number(baseWbs.taskCount) || 0,
    meta: sanitizeWbsMeta(
      wbsResult.meta && typeof wbsResult.meta === 'object'
        ? wbsResult.meta
        : { source: 'llm_failed', llmCalls: 0 }
    ),
  };
  return next;
}

/** @deprecated hierarchy removed — export stub for older imports */
function buildHeuristicWbsTasks() {
  return [];
}

module.exports = {
  AREA_ROLE_HINT,
  inferAreaFromCapability,
  slugPart,
  sanitizeWbsMeta,
  WBS_META_KEYS,
  buildHeuristicWbsTasks,
  runWbsEngine,
  runWbsEngineAsync,
  applyWbsToContainer,
};
