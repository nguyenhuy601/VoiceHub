/**
 * Single FE selector: liveRun → HOW progress view-model.
 * Catalog mirrors howPhaseGraph nodes + howToolDag soft layers (not legacy ReAct ids).
 * Planning layers: only tools actually in flight are marked current.
 */

import { formatElapsed, resolveFrozenElapsedMs } from './whatProgressViewModel.js';
import { WHAT_MONITOR_CONFIG } from './WHAT_MONITOR_CONFIG.js';

function resolveHowRunErrorMessage(liveRun, phaseMeta) {
  const candidates = [
    liveRun?.error?.message,
    liveRun?.errorMessage,
    liveRun?.message,
    phaseMeta?.error?.message,
    phaseMeta?.errorMessage,
    typeof phaseMeta?.error === 'string' ? phaseMeta.error : null,
  ];
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (text) return text;
  }
  return '';
}

/**
 * Macro catalog — keep in sync with howPhaseGraph + jobToToolsMap.HOW_PHASE_TOOL_STEPS.
 * Soft Kahn layers for engines: see HOW_PLANNING_LAYERS / howToolDag.
 */
export const HOW_MACRO_STEPS = Object.freeze([
  {
    step: 1,
    labelKey: 'requirements.aiHitlHowMacro1',
    fallback: 'Prepare',
    descriptionKey: 'requirements.aiHitlHowMacroDesc1',
    descriptionFallback: 'Preparing HOW context and selecting planning tools.',
    substeps: ['prepareHowContext', 'selectTools'],
  },
  {
    step: 2,
    labelKey: 'requirements.aiHitlHowMacro2',
    fallback: 'Engines',
    descriptionKey: 'requirements.aiHitlHowMacroDesc2',
    descriptionFallback:
      'Running planning tools by soft dependency order. Schedule owns timeline (no separate Sequencing/Matching tools).',
    substeps: [
      'WbsTool',
      'DependencyTool',
      'RiskTool',
      'QualityPlanTool',
      'ScheduleTool',
    ],
  },
  {
    step: 3,
    labelKey: 'requirements.aiHitlHowMacro3',
    fallback: 'Wrap-up & Gate 2',
    descriptionKey: 'requirements.aiHitlHowMacroDesc3',
    descriptionFallback: 'Assembling results, scoring completeness, finalizing plan, then feasibility for Gate 2.',
    substeps: ['assemble', 'scoreCompleteness', 'finalizePlan', 'feasibility'],
  },
]);

/** Flat HOW steps (same order as macros) — keep in sync with HOW tool registry / progress macros */
export const HOW_MONITOR_STEPS = Object.freeze(
  HOW_MACRO_STEPS.flatMap((m) =>
    m.substeps.map((id) => ({
      id,
      labelKey: `requirements.aiHitlHowStep_${id}`,
      fallback: id,
      kind: m.step === 2 ? 'compute' : 'signal',
    }))
  )
);

/**
 * Soft HOW tool layers — same Kahn layers as howToolDag.HOW_TOOL_DEPENDENCIES
 * (Risk ∥ Schedule after Dependency; Quality after Risk).
 * UX checklist only: ReAct may pick a subset; graph does not force whole-layer Send.
 */
export const HOW_PLANNING_LAYERS = Object.freeze([
  Object.freeze(['WbsTool']),
  Object.freeze(['DependencyTool']),
  Object.freeze(['RiskTool', 'ScheduleTool']),
  Object.freeze(['QualityPlanTool']),
]);

/** Execution status labels for Monitor (BE toolExecutions). */
export const HOW_EXECUTION_STATUS = Object.freeze({
  pending: 'queued',
  running: 'running',
  waiting_external: 'waiting_external',
  blocked: 'blocked',
  retrying: 'retrying',
  succeeded: 'succeeded',
  failed: 'failed',
  skipped: 'skipped',
});

const PLANNING_TOOL_IDS = new Set(HOW_PLANNING_LAYERS.flat());
const PLANNING_TOOL_ORDER = Object.freeze(HOW_PLANNING_LAYERS.flat());
const TOOL_ACTIVITY_NODES = new Set(['call_tool', 'execute', 'execute_how']);
const SELECT_LOOP_NODES = new Set(['selecttools', 'select', 'plan', 'injectgap']);

const SUBSTEP_TO_MACRO = (() => {
  const map = Object.create(null);
  for (const m of HOW_MACRO_STEPS) {
    for (const s of m.substeps) map[s] = m.step;
  }
  return map;
})();

/**
 * Graph / legacy progress nodes → catalog checklist id.
 * Legacy ReAct names (understand/select/observe/evaluateLocal) stay mapped for old runs.
 */
const NODE_ALIASES = Object.freeze({
  preparehowcontext: 'prepareHowContext',
  understand: 'prepareHowContext',
  selecttools: 'selectTools',
  select: 'selectTools',
  plan: 'selectTools',
  injectgap: 'selectTools',
  execute: 'WbsTool',
  execute_how: 'WbsTool',
  assemble: 'assemble',
  observe: 'assemble',
  scorecompleteness: 'scoreCompleteness',
  evaluate_local: 'scoreCompleteness',
  evaluatelocal: 'scoreCompleteness',
  evaluate: 'scoreCompleteness',
  finalizeplan: 'finalizePlan',
  projectplantool: 'finalizePlan',
  feasibility: 'feasibility',
  feasibilitysignal: 'feasibility',
  emitready: 'feasibility',
  emitincomplete: 'feasibility',
});

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isInFlightStatus(status) {
  // Do NOT include stopped/incomplete — those are terminal (emitIncomplete).
  // waiting_human is handled separately in normalizeHowRunStatus.
  // waiting_external = durable WBS park — still "live" until wall / resume / terminal.
  return ['pending', 'running', 'queued', 'waiting_external'].includes(norm(status));
}

/** Hard tool/provider failure — not incomplete/stopped. */
function isHardFailStatus(status) {
  return ['failed', 'error'].includes(norm(status));
}

/** Phase stopped short of Gate2 ready (emitIncomplete) — not the same as hard fail. */
function isIncompleteTerminalStatus(status) {
  return ['incomplete', 'stopped'].includes(norm(status));
}

/** Any non-success terminal used for wall-clock / stale liveRun checks. */
function isTerminalFailStatus(status) {
  return (
    isHardFailStatus(status) ||
    isIncompleteTerminalStatus(status) ||
    norm(status) === 'cancelled'
  );
}

function isCallbackHandoff(liveRun, phaseMeta = null) {
  const live = norm(liveRun?.status);
  const callback = norm(liveRun?.callbackStatus || phaseMeta?.callbackStatus);
  const compute = norm(liveRun?.computeStatus || phaseMeta?.computeStatus);
  const stage = norm(liveRun?.stage || phaseMeta?.stage);
  return (
    live === 'callback_pending' ||
    live === 'callback_delivering' ||
    callback === 'pending' ||
    callback === 'delivering' ||
    compute === 'completed' ||
    stage === 'finalizing'
  );
}

/**
 * Fuzzy match catalog id (Wbs ↔ WbsTool).
 * @returns {number} index in HOW_MONITOR_STEPS or -1
 */
export function matchHowStepIndex(nodeRaw) {
  const node = String(nodeRaw || '').trim();
  if (!node) return -1;
  const lower = node.toLowerCase();
  let idx = HOW_MONITOR_STEPS.findIndex((s) => s.id.toLowerCase() === lower);
  if (idx >= 0) return idx;
  idx = HOW_MONITOR_STEPS.findIndex((s) => {
    const id = s.id.toLowerCase();
    const bare = id.replace(/tool$/, '');
    const nodeBare = lower.replace(/tool$/, '');
    return bare === nodeBare || id === `${lower}tool` || bare === lower;
  });
  return idx;
}

function catalogId(raw) {
  const idx = matchHowStepIndex(raw);
  if (idx < 0) return null;
  return HOW_MONITOR_STEPS[idx].id;
}

function earliestCatalogId(ids) {
  let best = null;
  let bestIdx = -1;
  for (const id of ids) {
    const idx = matchHowStepIndex(id);
    if (idx < 0) continue;
    if (bestIdx < 0 || idx < bestIdx) {
      best = HOW_MONITOR_STEPS[idx].id;
      bestIdx = idx;
    }
  }
  return best;
}

/**
 * Tools actually in flight (ReAct / progress reducer).
 * Prefer explicit currentToolNames from BE; otherwise the single currentTool.
 * Do not invent sibling layer tools — ReAct ≠ forced DAG wave.
 */
/**
 * Prefer BE toolExecutions in-flight; do not invent Risk∥Schedule from layer alone.
 */
export function resolveHowToolExecutions(liveRun = null, phaseMeta = null) {
  const raw =
    liveRun?.toolExecutions ||
    liveRun?.currentExecutions ||
    phaseMeta?.toolExecutions ||
    phaseMeta?.currentExecutions ||
    null;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && row.toolName)
    .map((row) => ({
      toolName: catalogId(row.toolName) || String(row.toolName),
      status: HOW_EXECUTION_STATUS[row.status] || row.status || 'pending',
      attempt: Number(row.attempt) || 1,
      blockedBy: Array.isArray(row.blockedBy) ? row.blockedBy : [],
      error: row.error || null,
      progress: row.progress || null,
      jobId: row.jobId || null,
    }));
}

export function resolveHowRunningToolIds(liveRun = null, phaseMeta = null) {
  const executions = resolveHowToolExecutions(liveRun, phaseMeta);
  if (executions.length) {
    const active = new Set(['running', 'waiting_external', 'pending', 'queued', 'retrying']);
    const ids = [];
    const seen = new Set();
    for (const row of executions) {
      if (!active.has(norm(row.status))) continue;
      const id = catalogId(row.toolName) || row.toolName;
      if (!id || !PLANNING_TOOL_IDS.has(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length) return ids;
  }

  const node = norm(liveRun?.currentNode || liveRun?.stage || phaseMeta?.stage || '');
  if (node && !TOOL_ACTIVITY_NODES.has(node)) return [];

  const raw =
    liveRun?.currentToolNames ||
    liveRun?.currentTools ||
    phaseMeta?.currentToolNames ||
    null;
  if (Array.isArray(raw) && raw.length) {
    const ids = [];
    const seen = new Set();
    for (const name of raw) {
      const id = catalogId(name);
      if (!id || !PLANNING_TOOL_IDS.has(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length) return ids;
  }

  const single = catalogId(liveRun?.currentTool || liveRun?.currentToolName || '');
  if (single && PLANNING_TOOL_IDS.has(single)) {
    return [single];
  }
  return [];
}

/** @deprecated use resolveHowRunningToolIds — kept for callers that expect null when unset */
export function resolveHowActiveStepIds(liveRun = null, phaseMeta = null) {
  const ids = resolveHowRunningToolIds(liveRun, phaseMeta);
  return ids.length ? ids : null;
}

/** Planning tools that already terminal/in-flight — keep Engines macro across selectTools loops. */
export function resolveHowTouchedToolIds(liveRun = null, phaseMeta = null) {
  const executions = resolveHowToolExecutions(liveRun, phaseMeta);
  const touched = [];
  const seen = new Set();
  const touchStatus = new Set([
    'running',
    'waiting_external',
    'pending',
    'queued',
    'retrying',
    'succeeded',
    'failed',
    'skipped',
    'blocked',
  ]);
  for (const row of executions) {
    if (!touchStatus.has(norm(row.status))) continue;
    const id = catalogId(row.toolName) || row.toolName;
    if (!id || !PLANNING_TOOL_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    touched.push(id);
  }
  return touched;
}

function resolveSelectLoopStepId(liveRun, phaseMeta) {
  const running = resolveHowRunningToolIds(liveRun, phaseMeta);
  if (running.length) return earliestCatalogId(running);

  const touched = resolveHowTouchedToolIds(liveRun, phaseMeta);
  if (!touched.length) return 'selectTools';

  const touchedSet = new Set(touched);
  const nextPending = PLANNING_TOOL_ORDER.find((id) => !touchedSet.has(id));
  if (nextPending) return nextPending;

  // All catalog tools touched — stay on last in canonical layer order.
  for (let i = PLANNING_TOOL_ORDER.length - 1; i >= 0; i -= 1) {
    if (touchedSet.has(PLANNING_TOOL_ORDER[i])) return PLANNING_TOOL_ORDER[i];
  }
  return 'selectTools';
}

export function resolveHowActiveStepId(liveRun = null, phaseMeta = null) {
  const nodeRaw = String(
    liveRun?.currentNode || liveRun?.stage || liveRun?.pipelineSubstep || phaseMeta?.stage || ''
  ).trim();
  const nodeLower = norm(nodeRaw);

  const running = resolveHowRunningToolIds(liveRun, phaseMeta);
  if (running.length) return earliestCatalogId(running);

  if (!nodeRaw) return null;

  if (SELECT_LOOP_NODES.has(nodeLower)) {
    return resolveSelectLoopStepId(liveRun, phaseMeta);
  }

  if (TOOL_ACTIVITY_NODES.has(nodeLower)) {
    if (nodeLower === 'call_tool' || nodeLower === 'execute' || nodeLower === 'execute_how') {
      return 'WbsTool';
    }
    return null;
  }

  const aliased = NODE_ALIASES[nodeLower];
  if (aliased != null) return aliased;

  const idx = matchHowStepIndex(nodeRaw);
  if (idx >= 0) return HOW_MONITOR_STEPS[idx].id;
  return null;
}

function latestToolExecutionMap(toolExecutions) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const row of Array.isArray(toolExecutions) ? toolExecutions : []) {
    const id = catalogId(row?.toolName) || String(row?.toolName || '').trim();
    if (!id || !PLANNING_TOOL_IDS.has(id)) continue;
    const prev = map.get(id);
    const attempt = Number(row.attempt) || 0;
    const prevAttempt = Number(prev?.attempt) || 0;
    if (!prev || attempt >= prevAttempt) map.set(id, row);
  }
  return map;
}

/**
 * Soft Kahn layers + per-tool status from BE toolExecutions (blocked/failed/…).
 */
function buildPlanningLayerView(runningToolIds, phaseDone, toolExecutions = []) {
  const active = new Set(runningToolIds || []);
  const execByTool = latestToolExecutionMap(toolExecutions);
  let currentLayerIndex = -1;
  HOW_PLANNING_LAYERS.forEach((layer, index) => {
    if (layer.some((id) => active.has(id))) currentLayerIndex = index;
  });
  return HOW_PLANNING_LAYERS.map((toolIds, index) => {
    let state = 'pending';
    if (phaseDone || (currentLayerIndex >= 0 && index < currentLayerIndex)) state = 'done';
    else if (index === currentLayerIndex) state = 'current';
    const tools = toolIds.map((id) => {
      const row = execByTool.get(id);
      const execStatus = row ? norm(row.status) : '';
      let toolState = 'pending';
      if (execStatus === 'blocked') toolState = 'blocked';
      else if (execStatus === 'failed') toolState = 'failed';
      else if (execStatus === 'skipped') toolState = 'skipped';
      else if (execStatus === 'succeeded') toolState = 'succeeded';
      else if (active.has(id) || ['running', 'waiting_external', 'queued', 'pending', 'retrying'].includes(execStatus)) {
        toolState = 'running';
      } else if (state === 'done') {
        toolState = 'succeeded';
      }
      const blockedBy = Array.isArray(row?.blockedBy) ? row.blockedBy.map(String) : [];
      const errorMessage = row?.error?.message
        ? String(row.error.message).slice(0, 240)
        : '';
      return {
        id,
        status: toolState,
        blockedBy,
        errorMessage,
      };
    });
    return {
      index: index + 1,
      toolIds: [...toolIds],
      state,
      activeToolIds: toolIds.filter((id) => active.has(id)),
      tools,
    };
  });
}

function resolveHowActivity(liveRun, state, runningToolIds = []) {
  if (
    state === 'waiting_human' ||
    state === 'succeeded' ||
    state === 'failed' ||
    state === 'incomplete' ||
    state === 'cancelled' ||
    state === 'idle'
  ) {
    return { kind: null, toolName: null, toolNames: [], labelKey: null };
  }
  const tool = String(liveRun?.currentTool || liveRun?.currentToolName || '').trim() || null;
  const node = norm(liveRun?.currentNode || liveRun?.stage || '');
  const inToolNode = !node || TOOL_ACTIVITY_NODES.has(node);
  const toolNames = runningToolIds.length ? [...runningToolIds] : inToolNode && tool ? [tool] : [];

  if (
    inToolNode &&
    (toolNames.length || node === 'call_tool' || node === 'execute' || node === 'execute_how')
  ) {
    return {
      kind: 'call_tool',
      toolName: toolNames[0] || tool,
      toolNames,
      labelKey: 'requirements.aiHitlMonitorCallingTool',
    };
  }
  // Sec tool node names (WbsTool, …) also arrive as currentNode while in flight.
  const nodeAsTool = catalogId(liveRun?.currentNode || liveRun?.stage || '');
  if (
    toolNames.length ||
    (tool && PLANNING_TOOL_IDS.has(catalogId(tool) || tool)) ||
    (nodeAsTool && PLANNING_TOOL_IDS.has(nodeAsTool))
  ) {
    const names = toolNames.length
      ? toolNames
      : [catalogId(tool) || tool || nodeAsTool].filter(Boolean);
    return {
      kind: 'call_tool',
      toolName: names[0] || tool || nodeAsTool,
      toolNames: names,
      labelKey: 'requirements.aiHitlMonitorCallingTool',
    };
  }
  if (node === 'understand' || node === 'preparehowcontext') {
    return {
      kind: 'understand',
      toolName: null,
      toolNames: [],
      labelKey: 'requirements.aiHitlMonitorActivity_prepareHowContext',
    };
  }
  if (SELECT_LOOP_NODES.has(node)) {
    return {
      kind: 'plan',
      toolName: null,
      toolNames: [],
      labelKey: 'requirements.aiHitlMonitorActivity_selectTools',
    };
  }
  if (node === 'observe' || node === 'assemble') {
    return {
      kind: 'observe',
      toolName: null,
      toolNames: [],
      labelKey: 'requirements.aiHitlMonitorActivity_assemble',
    };
  }
  if (
    node === 'evaluatelocal' ||
    node === 'evaluate_local' ||
    node === 'evaluate' ||
    node === 'scorecompleteness'
  ) {
    return {
      kind: 'evaluate',
      toolName: null,
      toolNames: [],
      labelKey: 'requirements.aiHitlMonitorActivity_scoreCompleteness',
    };
  }
  if (node === 'finalizeplan') {
    return {
      kind: 'evaluate',
      toolName: null,
      toolNames: [],
      labelKey: 'requirements.aiHitlMonitorActivity_finalizePlan',
    };
  }
  if (node === 'feasibility' || node === 'emitready' || node === 'emitincomplete') {
    return {
      kind: 'evaluate',
      toolName: null,
      toolNames: [],
      labelKey: 'requirements.aiHitlMonitorActivity_feasibility',
    };
  }
  return { kind: 'idle', toolName: null, toolNames: [], labelKey: null };
}

/**
 * Map liveRun + phase_how status → Monitor UX state.
 * incomplete/stopped ≠ failed (RULE-FE-01).
 * @param {object|null} liveRun
 * @param {object|null} phaseHow
 * @param {number} [now]
 * @returns {'waiting_human'|'succeeded'|'cancelled'|'incomplete'|'failed'|'finalizing'|'queued'|'running'|'idle'}
 */
export function normalizeHowRunStatus(liveRun, phaseHow, now = Date.now()) {
  const live = norm(liveRun?.status);
  const phase = norm(phaseHow?.status);
  if (live === 'waiting_human' || phase === 'waiting_human') return 'waiting_human';
  if (['ready', 'completed', 'confirmed', 'succeeded'].includes(live) ||
      ['ready', 'completed', 'confirmed'].includes(phase)) {
    return 'succeeded';
  }
  // Prefer phase terminal over a stale liveRun still marked running.
  if (isTerminalFailStatus(phase) || isTerminalFailStatus(live)) {
    if (live === 'cancelled' || phase === 'cancelled') return 'cancelled';
    if (isIncompleteTerminalStatus(phase)) return 'incomplete';
    if (isHardFailStatus(phase)) return 'failed';
    if (isIncompleteTerminalStatus(live)) return 'incomplete';
    if (isHardFailStatus(live)) return 'failed';
    return 'failed';
  }
  if (
    isCallbackHandoff(liveRun, phaseHow) &&
    !['ready', 'completed', 'confirmed'].includes(phase)
  ) {
    return 'finalizing';
  }
  if (isInFlightStatus(live) || isInFlightStatus(phase)) {
    const maxLive = Number(WHAT_MONITOR_CONFIG.howRunMaxLiveMs) || 0;
    if (maxLive > 0) {
      // Wall from startedAt only — progress heartbeats must not keep a zombie clock alive.
      const startedRaw = liveRun?.startedAt || phaseHow?.startedAt || null;
      const startedAt = startedRaw ? new Date(startedRaw).getTime() : NaN;
      if (Number.isFinite(startedAt) && now - startedAt > maxLive) {
        return 'failed';
      }
    }
    return live === 'queued' || phase === 'queued' ? 'queued' : 'running';
  }
  return 'idle';
}

/**
 * @param {object|null} liveRun
 * @param {object|null} phaseHow
 * @param {number} [now]
 * @param {boolean} [hasProposeOutput] — pack already has HOW propose/results → stop elapsed
 */
export function resolveHowProgressViewModel(
  liveRun,
  phaseHow = null,
  now = Date.now(),
  hasProposeOutput = false
) {
  const state = normalizeHowRunStatus(liveRun, phaseHow, now);
  const phaseDone = state === 'succeeded';
  const terminalStopped =
    state === 'failed' || state === 'incomplete' || state === 'cancelled';
  const runningToolIds = phaseDone || terminalStopped
    ? []
    : resolveHowRunningToolIds(liveRun, phaseHow);
  const stepId = phaseDone
    ? HOW_MONITOR_STEPS[HOW_MONITOR_STEPS.length - 1].id
    : resolveHowActiveStepId(liveRun, phaseHow);
  const activeStepIds = phaseDone ? null : runningToolIds.length ? runningToolIds : null;

  let activeIndex = stepId ? HOW_MONITOR_STEPS.findIndex((s) => s.id === stepId) : -1;
  if (state === 'finalizing') {
    activeIndex = HOW_MONITOR_STEPS.length - 1;
  } else if (activeIndex < 0 && (state === 'running' || state === 'queued')) {
    activeIndex = 0;
  }

  const activeStepId =
    activeIndex >= 0 ? HOW_MONITOR_STEPS[activeIndex].id : null;
  const activeIndices = Array.isArray(activeStepIds)
    ? activeStepIds
        .map((id) => HOW_MONITOR_STEPS.findIndex((s) => s.id === id))
        .filter((i) => i >= 0)
    : null;
  const macroStep = activeStepId ? SUBSTEP_TO_MACRO[activeStepId] || 0 : phaseDone ? 3 : 0;
  const macroDef = HOW_MACRO_STEPS.find((m) => m.step === macroStep) || null;

  const startedRaw = liveRun?.startedAt || phaseHow?.startedAt || null;
  const startedAt = startedRaw ? new Date(startedRaw).getTime() : null;
  const completedRaw =
    liveRun?.completedAt ||
    liveRun?.finishedAt ||
    phaseHow?.completedAt ||
    phaseHow?.finishedAt ||
    null;
  const completedAt = completedRaw ? new Date(completedRaw).getTime() : null;
  const durationFromMeta = Number(liveRun?.durationMs ?? phaseHow?.durationMs);
  const terminal =
    state === 'succeeded' ||
    state === 'failed' ||
    state === 'incomplete' ||
    state === 'cancelled' ||
    state === 'waiting_human';
  // Never freeze while agent is still computing — Gate1 scope rollup / leftover propose
  // must not pin elapsed to a stale progressUpdatedAt during long tool LLM calls.
  const activelyComputing = state === 'running' || state === 'queued';
  const freezeClock =
    terminal ||
    state === 'finalizing' ||
    (Boolean(hasProposeOutput) && !activelyComputing);
  const progressUpdatedAt = liveRun?.progressUpdatedAt
    ? new Date(liveRun.progressUpdatedAt).getTime()
    : null;
  const maxLive = Number(WHAT_MONITOR_CONFIG.howRunMaxLiveMs) || 0;
  const wallTimedOut =
    state === 'failed' &&
    maxLive > 0 &&
    startedAt != null &&
    Number.isFinite(startedAt) &&
    now - startedAt > maxLive &&
    !isTerminalFailStatus(liveRun?.status) &&
    !isTerminalFailStatus(phaseHow?.status);

  let elapsedMs = resolveFrozenElapsedMs({
    startedAt: startedAt != null && Number.isFinite(startedAt) ? startedAt : null,
    completedAt: completedAt != null && Number.isFinite(completedAt) ? completedAt : null,
    progressUpdatedAt:
      progressUpdatedAt != null && Number.isFinite(progressUpdatedAt) ? progressUpdatedAt : null,
    durationFromMeta,
    freezeClock,
    now,
  });
  // Zombie / wall-timeout: never show multi-hour "elapsed" when FE forced terminal.
  if (
    (wallTimedOut || state === 'failed' || state === 'incomplete' || state === 'cancelled') &&
    maxLive > 0
  ) {
    elapsedMs = Math.min(elapsedMs, maxLive);
  }

  const progressStaleMs =
    progressUpdatedAt != null && Number.isFinite(progressUpdatedAt)
      ? Math.max(0, now - progressUpdatedAt)
      : elapsedMs;

  const toolExecutions = resolveHowToolExecutions(liveRun, phaseHow);
  const activity = resolveHowActivity(liveRun, state, runningToolIds);
  const planningLayers = buildPlanningLayerView(
    runningToolIds,
    phaseDone || state === 'finalizing',
    toolExecutions
  );
  const showSpinner = state === 'running' || state === 'queued' || state === 'finalizing';
  const waitingHuman = state === 'waiting_human';
  const staleThresholdMs = WHAT_MONITOR_CONFIG.progressStaleMs;
  const showProgressStale =
    !waitingHuman &&
    state === 'running' &&
    Number.isFinite(staleThresholdMs) &&
    progressStaleMs >= staleThresholdMs;
  let errorMessage = resolveHowRunErrorMessage(liveRun, phaseHow);
  if (state === 'incomplete' && !errorMessage) {
    errorMessage = 'HOW dừng chưa hoàn tất (incomplete/stopped). Xem kết quả partial và chạy lại nếu cần.';
  } else if (state === 'failed' && !errorMessage) {
    if (wallTimedOut) {
      errorMessage =
        'Phiên HOW quá hạn / mất tín hiệu tiến độ — đã dừng đồng hồ. Chạy lại HOW nếu cần.';
    } else {
      errorMessage = 'HOW thất bại. Xem lại dữ liệu đầu vào hoặc chạy lại.';
    }
  }

  // Don't keep "Chuẩn bị" as current when run already terminal-stopped.
  const displayMacroStep = terminalStopped ? 0 : macroStep;
  const isIncomplete = state === 'incomplete';
  const isHardFailed = state === 'failed' || state === 'cancelled';

  return {
    phase: 'how',
    state,
    macroStep: displayMacroStep,
    activeStepId: terminalStopped ? null : activeStepId,
    activeStepIds: terminalStopped
      ? []
      : activeStepIds || (activeStepId ? [activeStepId] : []),
    activeIndex: terminalStopped ? -1 : activeIndex,
    activeIndices: terminalStopped ? null : activeIndices,
    planningLayers,
    toolExecutions,
    showPlanningLayers:
      !phaseDone && !terminalStopped && macroStep === 2 && state !== 'finalizing',
    activeMacroSubsteps:
      terminalStopped || !macroDef ? [] : [...macroDef.substeps],
    activity,
    elapsedMs,
    progressStaleMs,
    showProgressStale,
    errorMessage,
    showSpinner,
    waitingHuman,
    titleKey: terminalStopped
      ? 'requirements.aiHitlMonitorHowTitle'
      : state === 'finalizing'
        ? 'requirements.aiHitlHowFinalizing'
        : macroDef?.labelKey || 'requirements.aiHitlMonitorHowTitle',
    titleFallback: terminalStopped
      ? 'Phase HOW'
      : state === 'finalizing'
        ? 'Saving results'
        : macroDef?.fallback || 'Phase HOW',
    descriptionKey: isIncomplete
      ? 'requirements.aiHitlMonitorHowIncompleteHint'
      : isHardFailed
        ? 'requirements.aiHitlMonitorHowFailedHint'
        : state === 'finalizing'
          ? 'requirements.aiHitlHowFinalizingDesc'
          : macroDef?.descriptionKey || 'requirements.aiHitlMonitorHowHint',
    descriptionFallback: isIncomplete
      ? 'HOW dừng chưa hoàn tất. Xem kết quả partial bên dưới; chạy lại HOW nếu cần bổ sung.'
      : isHardFailed
        ? 'Phiên HOW đã dừng. Bấm Chạy lại HOW để thử lại.'
        : state === 'finalizing'
          ? 'Analysis finished. Writing each section onto the pack.'
          : macroDef?.descriptionFallback || 'Đang chạy agent + tools. Chỉ hiện phase HOW.',
    runId: liveRun?.runId || phaseHow?.remoteRunId || null,
    progressUpdatedAt: liveRun?.progressUpdatedAt || null,
    startedAt: startedAt != null && Number.isFinite(startedAt) ? startedAt : null,
    completedAt: (() => {
      if (completedAt != null && Number.isFinite(completedAt)) {
        if (maxLive > 0 && startedAt != null && completedAt - startedAt > maxLive) {
          return startedAt + maxLive;
        }
        return completedAt;
      }
      if (!freezeClock) return null;
      if (wallTimedOut && startedAt != null) return startedAt + maxLive;
      if (
        progressUpdatedAt != null &&
        Number.isFinite(progressUpdatedAt) &&
        !(maxLive > 0 && startedAt != null && progressUpdatedAt - startedAt > maxLive)
      ) {
        return progressUpdatedAt;
      }
      if (startedAt != null && Number.isFinite(startedAt)) return startedAt + elapsedMs;
      return null;
    })(),
  };
}

export { formatElapsed };
export default resolveHowProgressViewModel;
