/**
 * Single FE selector: liveRun → WHAT progress view-model (3 layers).
 * RULE: pipelineSubstep wins; currentNode/tool = activity only.
 */

import { WHAT_MONITOR_CONFIG } from './WHAT_MONITOR_CONFIG.js';
import { getWhatStatusCopy, resolveActivityLabelKey } from './whatMonitorStatusCopy.js';

/** Macro catalog — mirrors Phase1AiRequirementProgress / APS pipelineProgress */
export const WHAT_MACRO_STEPS = Object.freeze([
  {
    step: 1,
    labelKey: 'requirements.phase1Step1',
    fallback: 'Input Sources',
    substeps: ['prepare'],
  },
  {
    step: 2,
    labelKey: 'requirements.phase1Step2',
    fallback: 'Requirement Understanding',
    substeps: ['parse', 'normalize', 'extract', 'filter', 'quality'],
  },
  {
    step: 3,
    labelKey: 'requirements.phase1Step3',
    fallback: 'Semantic Fetch',
    substeps: ['context_fetch', 'assemble_context', 'semantic', 'conflict'],
  },
  {
    step: 4,
    labelKey: 'requirements.phase1Step4',
    fallback: 'Agentic Orchestration',
    substeps: [
      'agent_understand',
      'plan',
      'validate',
      'synthesis',
      'evidence',
      'derive',
      'observe',
      'evaluate_local',
      'meta_gate',
    ],
  },
  {
    step: 5,
    labelKey: 'requirements.phase1Step5',
    fallback: 'Human Review (Gate 1)',
    substeps: [],
  },
  {
    step: 6,
    labelKey: 'requirements.phase1Step6',
    fallback: 'Approved SRS',
    substeps: [],
  },
]);

const SUBSTEP_TO_MACRO = (() => {
  const map = Object.create(null);
  for (const m of WHAT_MACRO_STEPS) {
    for (const s of m.substeps) map[s] = m.step;
  }
  return map;
})();

/** Legacy: node → business substep only when pipelineSubstep missing */
const LEGACY_NODE_TO_SUBSTEP = Object.freeze({
  prepare: 'prepare',
  gate_preview: 'quality',
  gate: 'quality',
});

let progressFallbackTotal = 0;

export function getWhatProgressFallbackTotal() {
  return progressFallbackTotal;
}

export function resetWhatProgressFallbackTotalForTests() {
  progressFallbackTotal = 0;
}

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * Normalize pack status / liveRun.status → VM run state.
 */
export function normalizeWhatRunStatus(liveRun, phaseWhat, packStatus) {
  const live = norm(liveRun?.status);
  const what = norm(phaseWhat?.status);
  const pack = norm(packStatus);
  const gate = norm(liveRun?.gate);

  if (live === 'waiting_human' || (gate === 'data_review' && what === 'pending')) {
    return 'waiting_human';
  }
  if (live === 'failed' || what === 'failed') return 'failed';
  if (live === 'cancelled') return 'cancelled';
  if (
    what === 'ready' ||
    what === 'completed' ||
    what === 'confirmed' ||
    pack === 'approved' ||
    pack === 'project_linked' ||
    pack === 'under_review'
  ) {
    if (what === 'pending' || live === 'running' || live === 'queued') {
      /* still in flight */
    } else if (pack === 'under_review' || pack === 'approved' || pack === 'project_linked') {
      return pack === 'approved' || pack === 'project_linked' ? 'succeeded' : 'waiting_human';
    } else if (what === 'ready' || what === 'completed' || what === 'confirmed') {
      return 'succeeded';
    }
  }
  if (live === 'queued' || what === 'queued') return 'queued';
  if (live === 'running' || what === 'pending' || live === 'replanning') return 'running';
  if (what === 'ready') return 'succeeded';
  return 'idle';
}

function resolveSubstep(liveRun, phaseWhat) {
  let explicit = String(liveRun?.pipelineSubstep || phaseWhat?.pipelineSubstep || '').trim();
  // WHAT step 4 ends at meta_gate; legacy "feasibility" is internal finalize only
  if (explicit === 'feasibility') explicit = 'meta_gate';
  if (explicit) {
    return { substep: explicit, usedLegacyFallback: false };
  }
  if (norm(liveRun?.gate) === 'data_review') {
    return { substep: 'quality', usedLegacyFallback: true };
  }
  const node = String(liveRun?.currentNode || liveRun?.stage || '').trim();
  const legacy = LEGACY_NODE_TO_SUBSTEP[node] || LEGACY_NODE_TO_SUBSTEP[norm(node)];
  if (legacy) {
    progressFallbackTotal += 1;
    if (typeof console !== 'undefined' && console.info) {
      console.info(
        `[WHAT_PROGRESS_FALLBACK] runId=${liveRun?.runId || ''} node=${node} reason=missing_pipelineSubstep`
      );
    }
    return { substep: legacy, usedLegacyFallback: true };
  }
  // Mid-flight without substep (e.g. brief gap after Data Gate resume): do NOT invent
  // prepare — that flashed Monitor back to step 1. Caller may sticky-hold last step.
  const inFlight =
    ['pending', 'running', 'waiting_human', 'queued'].includes(norm(liveRun?.status)) ||
    norm(phaseWhat?.status) === 'pending';
  if (inFlight) {
    progressFallbackTotal += 1;
    return { substep: null, usedLegacyFallback: true };
  }
  return { substep: null, usedLegacyFallback: false };
}

function resolveMacroStep(pipelineStep, substep, state, packStatus) {
  const pack = norm(packStatus);
  if (pack === 'approved' || pack === 'project_linked') return 6;
  if (state === 'waiting_human' && norm(pack) === 'under_review') return 5;
  if (state === 'succeeded' && pack === 'under_review') return 5;
  if (state === 'succeeded') return 5;

  const fromStep = Number(pipelineStep);
  if (Number.isFinite(fromStep) && fromStep >= 1 && fromStep <= 6) return fromStep;
  if (substep && SUBSTEP_TO_MACRO[substep]) return SUBSTEP_TO_MACRO[substep];
  // Unknown mid-run: 0 (not 1) — UI sticky / MacroRow must not invent "Input Sources"
  return 0;
}

function resolveActivity(liveRun, state) {
  if (state === 'waiting_human' || state === 'succeeded' || state === 'failed' || state === 'idle') {
    return { kind: null, toolName: null, labelKey: null };
  }
  const tool = String(liveRun?.currentTool || '').trim() || null;
  const node = norm(liveRun?.currentNode || liveRun?.stage || '');

  if (tool || node === 'call_tool' || node === 'execute') {
    const activity = {
      kind: 'call_tool',
      toolName: tool || (node === 'execute' ? 'RequirementAnalysisTool' : null),
      labelKey: 'requirements.aiHitlMonitorCallingTool',
    };
    if (!activity.toolName && node === 'call_tool') {
      activity.toolName = null;
    }
    return activity;
  }
  if (node === 'understand' || node === 'prepare') {
    return {
      kind: 'understand',
      toolName: null,
      labelKey: resolveActivityLabelKey({ kind: 'understand' }),
    };
  }
  if (node === 'plan' || node === 'select') {
    return {
      kind: 'plan',
      toolName: null,
      labelKey: resolveActivityLabelKey({ kind: 'plan' }),
    };
  }
  if (node === 'observe') {
    return {
      kind: 'observe',
      toolName: null,
      labelKey: resolveActivityLabelKey({ kind: 'observe' }),
    };
  }
  if (node === 'evaluatelocal' || node === 'evaluate_local' || node === 'evaluate') {
    return {
      kind: 'evaluate',
      toolName: null,
      labelKey: resolveActivityLabelKey({ kind: 'evaluate' }),
    };
  }
  return { kind: 'idle', toolName: null, labelKey: null };
}

/**
 * @param {object|null} liveRun
 * @param {object|null} phaseWhat
 * @param {number} [now]
 * @param {object} [config]
 * @param {string} [packStatus]
 */
export function resolveWhatProgressViewModel(
  liveRun,
  phaseWhat = null,
  now = Date.now(),
  config = WHAT_MONITOR_CONFIG,
  packStatus = ''
) {
  const state = normalizeWhatRunStatus(liveRun, phaseWhat, packStatus);
  const { substep, usedLegacyFallback } = resolveSubstep(liveRun, phaseWhat);
  const pipelineStep = liveRun?.pipelineStep ?? phaseWhat?.pipelineStep ?? null;
  const macroStep = resolveMacroStep(pipelineStep, substep, state, packStatus);
  const macroDef = WHAT_MACRO_STEPS.find((m) => m.step === macroStep) || null;
  const activeMacroSubsteps = macroDef ? [...macroDef.substeps] : [];

  const startedAt = liveRun?.startedAt ? new Date(liveRun.startedAt).getTime() : null;
  const elapsedMs =
    startedAt != null && Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;

  const progressUpdatedAt = liveRun?.progressUpdatedAt
    ? new Date(liveRun.progressUpdatedAt).getTime()
    : null;
  const progressStaleMs =
    progressUpdatedAt != null && Number.isFinite(progressUpdatedAt)
      ? Math.max(0, now - progressUpdatedAt)
      : elapsedMs;

  const waitingHuman = state === 'waiting_human';
  const softHintMs = config.softHintMs ?? WHAT_MONITOR_CONFIG.softHintMs;
  const softHintLongMs = config.softHintLongMs ?? WHAT_MONITOR_CONFIG.softHintLongMs;
  const showSoftHint =
    !waitingHuman &&
    state === 'running' &&
    (substep === 'prepare' || !substep) &&
    elapsedMs >= softHintMs;
  const softHintLong = showSoftHint && elapsedMs >= softHintLongMs;

  const activity = resolveActivity(liveRun, state);
  const showSpinner = state === 'running' || state === 'queued';

  const copy = getWhatStatusCopy({
    macroStep: macroStep || 1,
    waitingHuman,
    showSoftHint,
    softHintLong,
  });

  return {
    phase: 'what',
    state,
    macroStep,
    substep,
    activeMacroSubsteps,
    activity,
    elapsedMs,
    progressStaleMs,
    showSoftHint,
    softHintLong,
    titleKey: copy.titleKey,
    descriptionKey: copy.descriptionKey,
    titleFallback: copy.titleFallback,
    descriptionFallback: copy.descriptionFallback,
    waitingHuman,
    showSpinner,
    usedLegacyFallback,
    runId: liveRun?.runId || phaseWhat?.remoteRunId || null,
    progressUpdatedAt: liveRun?.progressUpdatedAt || null,
  };
}

export function formatElapsed(ms) {
  const totalSec = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default resolveWhatProgressViewModel;
