/**
 * WBS generation — hierarchy XOR LLM (Wave L) XOR queue worker (Wave M; HARD-02).
 */

const { buildHierarchicalWbs } = require('./wbsHierarchy');
const {
  decomposeWbsWithLlm,
  isHowWbsLlmEnabled,
} = require('./wbsLlmDecompose');
const { isHowWbsLlmQueueEnabled } = require('../contracts/howWbsLlmQueueContract');
const { shouldAttemptWbsLlm } = require('../contracts/howWbsLlmContract');
const { enqueueWbsLlmAndWait } = require('../jobs/enqueueWbsLlmAndWait');

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

/**
 * @deprecated Prefer buildHierarchicalWbs — kept for export compat; wraps hierarchy.
 */
function buildHeuristicWbsTasks(capabilities = [], pack = {}, planningHints = null) {
  const { tasks } = buildHierarchicalWbs({ capabilities, pack, planningHints });
  return tasks;
}

function hierarchyResult(capabilities, pack, planningHints, extraMeta = {}) {
  const { tasks, wbs } = buildHierarchicalWbs({ capabilities, pack, planningHints });
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    tasks,
    wbs,
    meta: {
      source: 'hierarchy',
      llmCalls: 0,
      capabilityCount: capabilities.length,
      taskCount: tasks.length,
      leafCount: wbs.taskCount,
      ...extraMeta,
    },
  };
}

function llmSuccessResult(llmOut, capabilities) {
  return {
    status: 'ready',
    model: llmOut.meta?.model || null,
    generatedAt: new Date().toISOString(),
    tasks: llmOut.tasks,
    wbs: llmOut.wbs,
    meta: {
      ...llmOut.meta,
      source: llmOut.meta?.source || 'llm_hierarchy',
      capabilityCount: capabilities.length,
      taskCount: llmOut.tasks.length,
      leafCount: llmOut.wbs.taskCount,
    },
  };
}

function fallbackHierarchy(capabilities, pack, planningHints, llmOut) {
  const fallbackMeta = {
    fallbackReason: llmOut.meta?.fallbackReason || 'llm_failed',
    llmCalls: llmOut.meta?.llmCalls || 0,
    model: llmOut.meta?.model || null,
    llmMs: llmOut.meta?.llmMs,
    promptChars: llmOut.meta?.promptChars,
    numPredict: llmOut.meta?.numPredict,
    numCtx: llmOut.meta?.numCtx,
    queue: llmOut.meta?.queue || false,
    jobId: llmOut.meta?.jobId || null,
    transport: llmOut.meta?.transport || null,
  };
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(
      `[how-wbs-llm] XOR→hierarchy reason=${fallbackMeta.fallbackReason} llmMs=${fallbackMeta.llmMs ?? '-'} queue=${fallbackMeta.queue}`
    );
  }
  return hierarchyResult(capabilities, pack, planningHints, fallbackMeta);
}

/**
 * Sync path (flag off / tests). Prefer runWbsEngineAsync when LLM may be on.
 */
function runWbsEngine(container = {}, opts = {}) {
  const capabilities = container?.analyses?.capability?.items || [];
  const pack = opts.pack || container?.pack || {};
  const planningHints = opts.planningHints || null;
  return hierarchyResult(capabilities, pack, planningHints);
}

/**
 * XOR: queue LLM (M) | in-process LLM (L) | hierarchy.
 * Single write via applyWbsToContainer (HARD-02).
 *
 * @param {object} container
 * @param {{ pack?: object, planningHints?: object, env?: object, generateJsonFn?: Function, runId?: string, generationId?: string }} opts
 */
async function runWbsEngineAsync(container = {}, opts = {}) {
  const capabilities = container?.analyses?.capability?.items || [];
  const pack = opts.pack || container?.pack || {};
  const planningHints = opts.planningHints || null;
  const env = opts.env || process.env;

  if (!isHowWbsLlmEnabled(env)) {
    return hierarchyResult(capabilities, pack, planningHints);
  }

  if (!shouldAttemptWbsLlm(pack, env)) {
    return hierarchyResult(capabilities, pack, planningHints, {
      fallbackReason: 'empty_fr_pack',
      llmCalls: 0,
    });
  }

  let llmOut;
  if (isHowWbsLlmQueueEnabled(env)) {
    llmOut = await enqueueWbsLlmAndWait({
      pack,
      capabilities,
      planningHints,
      runId: opts.runId || null,
      generationId: opts.generationId || null,
      env,
      generateJsonFn: opts.generateJsonFn,
    });
  } else {
    llmOut = await decomposeWbsWithLlm({
      pack,
      capabilities,
      planningHints,
      env,
      generateJsonFn: opts.generateJsonFn,
    });
  }

  if (llmOut.ok && Array.isArray(llmOut.tasks) && llmOut.wbs) {
    return llmSuccessResult(llmOut, capabilities);
  }

  return fallbackHierarchy(capabilities, pack, planningHints, llmOut);
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
    taskCount: next.planning.tasks.length,
  };
  // Persist XOR provenance for Gate2 / smoke (HARD-03 real field)
  next.planning.wbs = {
    ...baseWbs,
    meta:
      wbsResult.meta && typeof wbsResult.meta === 'object'
        ? { ...wbsResult.meta }
        : baseWbs.meta && typeof baseWbs.meta === 'object'
          ? { ...baseWbs.meta }
          : { source: 'hierarchy', llmCalls: 0 },
  };
  return next;
}

module.exports = {
  AREA_ROLE_HINT,
  inferAreaFromCapability,
  slugPart,
  buildHeuristicWbsTasks,
  runWbsEngine,
  runWbsEngineAsync,
  applyWbsToContainer,
};
