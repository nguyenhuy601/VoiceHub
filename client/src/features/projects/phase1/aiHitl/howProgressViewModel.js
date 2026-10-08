/**
 * Single FE selector: liveRun → HOW progress view-model (3 layers).
 * RULE: when node=call_tool|execute, currentTool drives checklist; node = activity otherwise.
 * Mirrors agentLoopRunner HOW sequence (understand → select → tools → wrap-up).
 */

import { formatElapsed } from './whatProgressViewModel.js';

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
    descriptionFallback: 'Running planning engines (WBS → Schedule).',
    substeps: [
      'WbsTool',
      'DependencyTool',
      'ArchitectureTool',
      'RiskTool',
      'EffortTool',
      'SequencingTool',
      'EmployeeMatchingTool',
      'ScheduleTool',
    ],
  },
  {
    step: 3,
    labelKey: 'requirements.aiHitlHowMacro3',
    fallback: 'Wrap-up & Gate 2',
    descriptionKey: 'requirements.aiHitlHowMacroDesc3',
    descriptionFallback: 'Observe, feasibility signal, and project plan for Gate 2.',
    substeps: ['observe', 'evaluateLocal', 'feasibility', 'ProjectPlanTool'],
  },
]);

/** Flat HOW steps (same order as macros) — keep in sync with agentLoopRunner / tools */
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

/**
 * Resolve which HOW catalog step is active from live progress.
 * Prefer currentTool only when agent is in call_tool/execute (activity node ≠ checklist step).
 */
export function resolveHowActiveStepId(liveRun = null, phaseMeta = null) {
  const tool = String(liveRun?.currentTool || liveRun?.currentToolName || '').trim();
  const nodeRaw = String(
    liveRun?.currentNode || liveRun?.stage || liveRun?.pipelineSubstep || phaseMeta?.stage || ''
  ).trim();
  const nodeLower = norm(nodeRaw);

  // Tool activity: checklist follows the tool being called
  if (nodeLower === 'call_tool' || nodeLower === 'execute') {
    if (tool) {
      const toolIdx = matchHowStepIndex(tool);
      if (toolIdx >= 0) return HOW_MONITOR_STEPS[toolIdx].id;
    }
    return 'WbsTool';
  }

  if (!nodeRaw) {
    if (tool) {
      const toolIdx = matchHowStepIndex(tool);
      if (toolIdx >= 0) return HOW_MONITOR_STEPS[toolIdx].id;
    }
    return null;
  }

  const aliased = NODE_ALIASES[nodeLower];
  if (aliased != null) {
    return aliased;
  }

  const idx = matchHowStepIndex(nodeRaw);
  if (idx >= 0) return HOW_MONITOR_STEPS[idx].id;

  // Unknown node but tool present (e.g. mid-flight race)
  if (tool) {
    const toolIdx = matchHowStepIndex(tool);
    if (toolIdx >= 0) return HOW_MONITOR_STEPS[toolIdx].id;
  }
  return null;
}

function resolveHowActivity(liveRun, state) {
  if (state === 'waiting_human' || state === 'succeeded' || state === 'failed' || state === 'idle') {
    return { kind: null, toolName: null, labelKey: null };
  }
  const tool = String(liveRun?.currentTool || liveRun?.currentToolName || '').trim() || null;
  const node = norm(liveRun?.currentNode || liveRun?.stage || '');

  if (tool || node === 'call_tool' || node === 'execute') {
    return {
      kind: 'call_tool',
      toolName: tool,
      labelKey: 'requirements.aiHitlMonitorCallingTool',
    };
  }
  if (node === 'understand') {
    return {
      kind: 'understand',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_understand',
    };
  }
  if (node === 'plan' || node === 'select') {
    return {
      kind: 'plan',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_plan',
    };
  }
  if (node === 'observe') {
    return {
      kind: 'observe',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_observe',
    };
  }
  if (node === 'evaluatelocal' || node === 'evaluate_local' || node === 'evaluate') {
    return {
      kind: 'evaluate',
      toolName: null,
      labelKey: 'requirements.aiHitlMonitorActivity_evaluate',
    };
  }
  if (node === 'feasibility') {
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
  if (isInFlightStatus(live) || isInFlightStatus(phase)) {
    return live === 'queued' || phase === 'queued' ? 'queued' : 'running';
  }
  return 'idle';
}

/**
 * @param {object|null} liveRun
 * @param {object|null} phaseHow
 * @param {number} [now]
 */
export function resolveHowProgressViewModel(liveRun, phaseHow = null, now = Date.now()) {
  const state = normalizeHowRunStatus(liveRun, phaseHow);
  const phaseDone = state === 'succeeded';
  const stepId = phaseDone
    ? HOW_MONITOR_STEPS[HOW_MONITOR_STEPS.length - 1].id
    : resolveHowActiveStepId(liveRun, phaseHow);

  let activeIndex = stepId ? HOW_MONITOR_STEPS.findIndex((s) => s.id === stepId) : -1;
  if (activeIndex < 0 && (state === 'running' || state === 'queued')) {
    activeIndex = 0;
  }

  const activeStepId =
    activeIndex >= 0 ? HOW_MONITOR_STEPS[activeIndex].id : null;
  const macroStep = activeStepId ? SUBSTEP_TO_MACRO[activeStepId] || 0 : phaseDone ? 3 : 0;
  const macroDef = HOW_MACRO_STEPS.find((m) => m.step === macroStep) || null;

  const startedAt = liveRun?.startedAt
    ? new Date(liveRun.startedAt).getTime()
    : phaseHow?.startedAt
      ? new Date(phaseHow.startedAt).getTime()
      : null;
  const elapsedMs =
    startedAt != null && Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;

  const progressUpdatedAt = liveRun?.progressUpdatedAt
    ? new Date(liveRun.progressUpdatedAt).getTime()
    : null;

  const activity = resolveHowActivity(liveRun, state);
  const showSpinner = state === 'running' || state === 'queued';

  return {
    phase: 'how',
    state,
    macroStep,
    activeStepId,
    activeIndex,
    activeMacroSubsteps: macroDef ? [...macroDef.substeps] : [],
    activity,
    elapsedMs,
    showSpinner,
    waitingHuman: state === 'waiting_human',
    titleKey: macroDef?.labelKey || 'requirements.aiHitlMonitorHowTitle',
    titleFallback: macroDef?.fallback || 'Phase HOW',
    descriptionKey: macroDef?.descriptionKey || 'requirements.aiHitlMonitorHowHint',
    descriptionFallback:
      macroDef?.descriptionFallback || 'Đang chạy agent + tools. Chỉ hiện phase HOW.',
    runId: liveRun?.runId || phaseHow?.remoteRunId || null,
    progressUpdatedAt: liveRun?.progressUpdatedAt || null,
    startedAt: startedAt != null && Number.isFinite(startedAt) ? startedAt : null,
  };
}

export { formatElapsed };
export default resolveHowProgressViewModel;
