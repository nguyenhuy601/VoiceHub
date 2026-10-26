/**
 * Single FE selector: liveRun → HOW progress view-model.
 * Agent nodes (understand / select / observe) stay sequential.
 * Planning layers mirror howToolDag soft deps (ReAct selectTools); only tools
 * actually in flight are marked current — siblings in a layer may not co-run.
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

/** Macro catalog — groups flat HOW agent/tool steps for Monitor UX */
export const HOW_MACRO_STEPS = Object.freeze([
  {
    step: 1,
    labelKey: 'requirements.aiHitlHowMacro1',
    fallback: 'Prepare',
    descriptionKey: 'requirements.aiHitlHowMacroDesc1',
    descriptionFallback: 'Understanding scope and selecting planning tools.',
    substeps: ['understand', 'select'],
  },
  {
    step: 2,
    labelKey: 'requirements.aiHitlHowMacro2',
    fallback: 'Engines',
    descriptionKey: 'requirements.aiHitlHowMacroDesc2',
    descriptionFallback:
      'Running planning tools by soft dependency order. Schedule owns timeline (no separate Sequencing/Matching tools).',
    substeps: [
      'BacklogMapTool',
      'WbsTool',
      'DependencyTool',
      'RiskTool',
      'QualityPlanTool',
      'ScheduleTool',
      'ProjectPlanTool',
    ],
  },
  {
    step: 3,
    labelKey: 'requirements.aiHitlHowMacro3',
    fallback: 'Wrap-up & Gate 2',
    descriptionKey: 'requirements.aiHitlHowMacroDesc3',
    descriptionFallback: 'Observing results and checking feasibility before Gate 2.',
    substeps: ['observe', 'evaluateLocal', 'feasibility'],
  },
]);

/** Flat HOW steps (same order as macros) — keep in sync with HOW tool registry / progress macros */
export const HOW_MONITOR_STEPS = Object.freeze(
  HOW_MACRO_STEPS.flatMap((m) =>
    m.substeps.map((id) => ({
      id,
      labelKey: `requirements.aiHitlHowStep_${id}`,
      fallback: id,
      kind: m.step === 2 || id === 'ProjectPlanTool' ? 'compute' : 'signal',
    }))
  )
);

/**
 * Soft HOW tool layers — same Kahn layers as howToolDag.HOW_TOOL_DEPENDENCIES
 * (Sequencing / EmployeeMatching removed; schedule+sprint live in ScheduleTool).
 * UX checklist only: ReAct may pick a subset; graph does not force whole-layer Send.
 */
export const HOW_PLANNING_LAYERS = Object.freeze([
  Object.freeze(['BacklogMapTool', 'WbsTool']),
  Object.freeze(['DependencyTool']),
  Object.freeze(['RiskTool', 'ScheduleTool']),
  Object.freeze(['QualityPlanTool']),
  Object.freeze(['ProjectPlanTool']),
]);

const PLANNING_TOOL_IDS = new Set(HOW_PLANNING_LAYERS.flat());
const TOOL_ACTIVITY_NODES = new Set(['call_tool', 'execute', 'execute_how']);

const SUBSTEP_TO_MACRO = (() => {
  const map = Object.create(null);
  for (const m of HOW_MACRO_STEPS) {
    for (const s of m.substeps) map[s] = m.step;
  }
  return map;
})();

/** Agent nodes that are not catalog ids — map to nearest checklist step */
const NODE_ALIASES = Object.freeze({
  plan: 'select',
  execute: 'WbsTool',
  evaluate_local: 'evaluateLocal',
  evaluate: 'evaluateLocal',
  feasibilitysignal: 'feasibility',
});

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isInFlightStatus(status) {
  return ['pending', 'running', 'queued', 'waiting_human', 'stopped'].includes(norm(status));
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
export function resolveHowRunningToolIds(liveRun = null, phaseMeta = null) {
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

export function resolveHowActiveStepId(liveRun = null, phaseMeta = null) {
  const nodeRaw = String(
    liveRun?.currentNode || liveRun?.stage || liveRun?.pipelineSubstep || phaseMeta?.stage || ''
  ).trim();
  const nodeLower = norm(nodeRaw);

  if (!TOOL_ACTIVITY_NODES.has(nodeLower)) {
    if (!nodeRaw) {
      const running = resolveHowRunningToolIds(liveRun, phaseMeta);
      return earliestCatalogId(running);
    }
    const aliased = NODE_ALIASES[nodeLower];
    if (aliased != null && nodeLower !== 'execute') return aliased;
    const idx = matchHowStepIndex(nodeRaw);
    if (idx >= 0) return HOW_MONITOR_STEPS[idx].id;
  }

  const running = resolveHowRunningToolIds(liveRun, phaseMeta);
  const fromLayer = earliestCatalogId(running);
  if (fromLayer) return fromLayer;

  if (nodeLower === 'call_tool' || nodeLower === 'execute') return 'WbsTool';
  return null;
}

function buildPlanningLayerView(runningToolIds, phaseDone) {
  const active = new Set(runningToolIds || []);
  let currentLayerIndex = -1;
  HOW_PLANNING_LAYERS.forEach((layer, index) => {
    if (layer.some((id) => active.has(id))) currentLayerIndex = index;
  });
  return HOW_PLANNING_LAYERS.map((toolIds, index) => {
    let state = 'pending';
    if (phaseDone || (currentLayerIndex >= 0 && index < currentLayerIndex)) state = 'done';
    else if (index === currentLayerIndex) state = 'current';
    return {
      index: index + 1,
      toolIds: [...toolIds],
      state,
      activeToolIds: toolIds.filter((id) => active.has(id)),
    };
  });
}

function resolveHowActivity(liveRun, state, runningToolIds = []) {
  if (
    state === 'waiting_human' ||
    state === 'succeeded' ||
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'idle'
  ) {
    return { kind: null, toolName: null, toolNames: [], labelKey: null };
  }
  const tool = String(liveRun?.currentTool || liveRun?.currentToolName || '').trim() || null;
  const node = norm(liveRun?.currentNode || liveRun?.stage || '');
  const inToolNode = !node || TOOL_ACTIVITY_NODES.has(node);
  const toolNames = runningToolIds.length ? [...runningToolIds] : inToolNode && tool ? [tool] : [];

  if (inToolNode && (toolNames.length || node === 'call_tool' || node === 'execute')) {
    return {
      kind: 'call_tool',
      toolName: toolNames[0] || tool,
      toolNames,
      labelKey: 'requirements.aiHitlMonitorCallingTool',
    };
  }
  if (node === 'understand' || node === 'preparehowcontext') {
    return {
      kind: 'understand',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_understand',
    };
  }
  if (
    node === 'plan' ||
    node === 'select' ||
    node === 'selecttools' ||
    node === 'injectgap'
  ) {
    return {
      kind: 'plan',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_plan',
    };
  }
  if (node === 'observe' || node === 'assemble') {
    return {
      kind: 'observe',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_observe',
    };
  }
  if (
    node === 'evaluatelocal' ||
    node === 'evaluate_local' ||
    node === 'evaluate' ||
    node === 'scorecompleteness' ||
    node === 'feasibility' ||
    node === 'emitready' ||
    node === 'emitincomplete'
  ) {
    return {
      kind: 'evaluate',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_evaluate',
    };
  }
  return { kind: 'idle', toolName: null, labelKey: null };
}

function normalizeHowRunStatus(liveRun, phaseHow) {
  const live = norm(liveRun?.status);
  const phase = norm(phaseHow?.status);
  if (live === 'waiting_human' || phase === 'waiting_human') return 'waiting_human';
  if (['ready', 'completed', 'confirmed', 'succeeded'].includes(live) ||
      ['ready', 'completed', 'confirmed'].includes(phase)) {
    return 'succeeded';
  }
  if (live === 'failed' || phase === 'failed') return 'failed';
  if (live === 'cancelled' || phase === 'cancelled') return 'cancelled';
  if (
    isCallbackHandoff(liveRun, phaseHow) &&
    !['ready', 'completed', 'confirmed'].includes(phase)
  ) {
    return 'finalizing';
  }
  if (isInFlightStatus(live) || isInFlightStatus(phase)) {
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
  const state = normalizeHowRunStatus(liveRun, phaseHow);
  const phaseDone = state === 'succeeded';
  const runningToolIds = phaseDone ? [] : resolveHowRunningToolIds(liveRun, phaseHow);
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
    state === 'cancelled' ||
    state === 'waiting_human';
  const freezeClock = terminal || state === 'finalizing' || Boolean(hasProposeOutput);
  const progressUpdatedAt = liveRun?.progressUpdatedAt
    ? new Date(liveRun.progressUpdatedAt).getTime()
    : null;
  const elapsedMs = resolveFrozenElapsedMs({
    startedAt: startedAt != null && Number.isFinite(startedAt) ? startedAt : null,
    completedAt: completedAt != null && Number.isFinite(completedAt) ? completedAt : null,
    progressUpdatedAt:
      progressUpdatedAt != null && Number.isFinite(progressUpdatedAt) ? progressUpdatedAt : null,
    durationFromMeta,
    freezeClock,
    now,
  });
  const progressStaleMs =
    progressUpdatedAt != null && Number.isFinite(progressUpdatedAt)
      ? Math.max(0, now - progressUpdatedAt)
      : elapsedMs;

  const activity = resolveHowActivity(liveRun, state, runningToolIds);
  const planningLayers = buildPlanningLayerView(runningToolIds, phaseDone || state === 'finalizing');
  const showSpinner = state === 'running' || state === 'queued' || state === 'finalizing';
  const waitingHuman = state === 'waiting_human';
  const staleThresholdMs = WHAT_MONITOR_CONFIG.progressStaleMs;
  const showProgressStale =
    !waitingHuman &&
    state === 'running' &&
    Number.isFinite(staleThresholdMs) &&
    progressStaleMs >= staleThresholdMs;
  const errorMessage = resolveHowRunErrorMessage(liveRun, phaseHow);

  return {
    phase: 'how',
    state,
    macroStep,
    activeStepId,
    activeStepIds: activeStepIds || (activeStepId ? [activeStepId] : []),
    activeIndex,
    activeIndices,
    planningLayers,
    showPlanningLayers: !phaseDone && macroStep === 2 && state !== 'finalizing',
    activeMacroSubsteps: macroDef ? [...macroDef.substeps] : [],
    activity,
    elapsedMs,
    progressStaleMs,
    showProgressStale,
    errorMessage,
    showSpinner,
    waitingHuman,
    titleKey:
      state === 'finalizing'
        ? 'requirements.aiHitlHowFinalizing'
        : macroDef?.labelKey || 'requirements.aiHitlMonitorHowTitle',
    titleFallback: state === 'finalizing' ? 'Saving results' : macroDef?.fallback || 'Phase HOW',
    descriptionKey:
      state === 'finalizing'
        ? 'requirements.aiHitlHowFinalizingDesc'
        : macroDef?.descriptionKey || 'requirements.aiHitlMonitorHowHint',
    descriptionFallback:
      state === 'finalizing'
        ? 'Analysis finished. Writing each section onto the pack.'
        : macroDef?.descriptionFallback || 'Đang chạy agent + tools. Chỉ hiện phase HOW.',
    runId: liveRun?.runId || phaseHow?.remoteRunId || null,
    progressUpdatedAt: liveRun?.progressUpdatedAt || null,
    startedAt: startedAt != null && Number.isFinite(startedAt) ? startedAt : null,
    completedAt: (() => {
      if (completedAt != null && Number.isFinite(completedAt)) return completedAt;
      if (!freezeClock) return null;
      if (progressUpdatedAt != null && Number.isFinite(progressUpdatedAt)) return progressUpdatedAt;
      if (startedAt != null && Number.isFinite(startedAt)) return startedAt + elapsedMs;
      return null;
    })(),
  };
}

export { formatElapsed };
export default resolveHowProgressViewModel;
