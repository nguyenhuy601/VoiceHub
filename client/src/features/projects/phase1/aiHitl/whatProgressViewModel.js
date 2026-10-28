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
  prepareWhat: 'prepare',
  preparewhat: 'prepare',
  gate_preview: 'quality',
  gate: 'quality',
  finalizeMeta: 'meta_gate',
  finalizemeta: 'meta_gate',
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
 * Compute finished; pack callback / pull may still be in flight.
 * Also reads phase meta — liveRun can be null while phase_what still pending.
 */
export function isCallbackHandoff(liveRun, phaseMeta = null) {
  const live = norm(liveRun?.status);
  const callback = norm(liveRun?.callbackStatus || phaseMeta?.callbackStatus);
  const compute = norm(liveRun?.computeStatus || phaseMeta?.computeStatus);
  const stage = norm(liveRun?.stage || phaseMeta?.stage);
  return (
    live === 'callback_pending' ||
    live === 'callback_delivering' ||
    live === 'completed' ||
    callback === 'pending' ||
    callback === 'delivering' ||
    compute === 'completed' ||
    stage === 'finalizing'
  );
}

/**
 * Freeze wall-clock when run is no longer actively computing.
 * Elapsed must stay continuous with the live ticker (now − startedAt):
 * prefer completedAt / wall end, never snap down to a shorter graph-only durationMs.
 * durationMs is only a fallback when startedAt is missing.
 */
export function resolveFrozenElapsedMs({
  startedAt,
  completedAt,
  progressUpdatedAt,
  durationFromMeta,
  freezeClock,
  now,
}) {
  const duration = Number(durationFromMeta);
  if (startedAt == null || !Number.isFinite(startedAt)) {
    if (freezeClock && Number.isFinite(duration) && duration > 0) {
      return Math.max(0, duration);
    }
    return 0;
  }
  if (!freezeClock) {
    return Math.max(0, now - startedAt);
  }
  const candidates = [];
  if (completedAt != null && Number.isFinite(completedAt) && completedAt > 0) {
    candidates.push(completedAt);
  } else {
    // Finalizing / handoff: keep the live wall — do not shrink to graph durationMs.
    candidates.push(now);
  }
  if (Number.isFinite(duration) && duration > 0) {
    candidates.push(startedAt + duration);
  }
  if (progressUpdatedAt != null && Number.isFinite(progressUpdatedAt) && progressUpdatedAt > 0) {
    candidates.push(progressUpdatedAt);
  }
  const end = Math.min(Math.max(...candidates), now);
  return Math.max(0, end - startedAt);
}

/**
 * Normalize pack status / liveRun.status → VM run state.
 */
export function normalizeWhatRunStatus(liveRun, phaseWhat, packStatus) {
  const live = norm(liveRun?.status);
  const what = norm(phaseWhat?.status);
  const pack = norm(packStatus);
  const gate = norm(liveRun?.gate);
  const phaseReady = what === 'ready' || what === 'completed' || what === 'confirmed';

  if (live === 'waiting_human' || (gate === 'data_review' && what === 'pending')) {
    return 'waiting_human';
  }
  if (live === 'failed' || what === 'failed') return 'failed';
  if (live === 'cancelled') return 'cancelled';
  // Agent compute done — freeze timer while callback writes pack (do not keep "running").
  if (isCallbackHandoff(liveRun, phaseWhat) && !phaseReady) {
    return 'finalizing';
  }
  if (
    phaseReady ||
    pack === 'approved' ||
    pack === 'project_linked' ||
    pack === 'under_review'
  ) {
    if (what === 'pending' || live === 'running' || live === 'queued') {
      /* still in flight */
    } else if (pack === 'under_review' || pack === 'approved' || pack === 'project_linked') {
      return pack === 'approved' || pack === 'project_linked' ? 'succeeded' : 'waiting_human';
    } else if (phaseReady) {
      return 'succeeded';
    }
  }
  if (live === 'queued' || what === 'queued') return 'queued';
  if (live === 'running' || what === 'pending' || live === 'replanning') return 'running';
  if (phaseReady) return 'succeeded';
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

function resolveRunErrorMessage(liveRun, phaseMeta) {
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

function resolveActivity(liveRun, state) {
  if (
    state === 'waiting_human' ||
    state === 'succeeded' ||
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'idle'
  ) {
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
  if (
    node === 'understand' ||
    node === 'prepare' ||
    node === 'preparewhat' ||
    node === 'runfrunderstanding'
  ) {
    return {
      kind: 'understand',
      toolName: null,
      labelKey: resolveActivityLabelKey({ kind: 'understand' }),
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
  if (
    node === 'evaluatelocal' ||
    node === 'evaluate_local' ||
    node === 'evaluate' ||
    node === 'finalizemeta' ||
    node === 'scorecompleteness' ||
    node === 'metagate' ||
    node === 'feasibility' ||
    node === 'emitready' ||
    node === 'emitincomplete'
  ) {
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
 * @param {boolean} [hasProposeOutput] — pack already has propose/results table → stop elapsed
 */
export function resolveWhatProgressViewModel(
  liveRun,
  phaseWhat = null,
  now = Date.now(),
  config = WHAT_MONITOR_CONFIG,
  packStatus = '',
  hasProposeOutput = false
) {
  const state = normalizeWhatRunStatus(liveRun, phaseWhat, packStatus);
  const { substep, usedLegacyFallback } = resolveSubstep(liveRun, phaseWhat);
  const pipelineStep = liveRun?.pipelineStep ?? phaseWhat?.pipelineStep ?? null;
  const macroStep = resolveMacroStep(pipelineStep, substep, state, packStatus);
  const macroDef = WHAT_MACRO_STEPS.find((m) => m.step === macroStep) || null;
  const activeMacroSubsteps = macroDef ? [...macroDef.substeps] : [];

  const startedAt = resolveTimestampMs(
    liveRun?.startedAt,
    phaseWhat?.startedAt,
    phaseWhat?.started
  );
  const completedAt = resolveTimestampMs(
    liveRun?.completedAt,
    liveRun?.finishedAt,
    phaseWhat?.completedAt,
    phaseWhat?.finishedAt,
    phaseWhat?.endedAt
  );
  const durationFromMeta = Number(liveRun?.durationMs ?? phaseWhat?.durationMs);
  const terminal =
    state === 'succeeded' ||
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'waiting_human';
  // Never freeze while agent is still computing — leftover propose rows (re-run) or
  // Gate1 rollup must not pin elapsed to a stale progressUpdatedAt mid-LLM call.
  const activelyComputing = state === 'running' || state === 'queued';
  const freezeClock =
    terminal ||
    state === 'finalizing' ||
    (Boolean(hasProposeOutput) && !activelyComputing);
  const progressUpdatedAt = resolveTimestampMs(liveRun?.progressUpdatedAt, phaseWhat?.progressUpdatedAt);
  const elapsedMs = resolveFrozenElapsedMs({
    startedAt,
    completedAt,
    progressUpdatedAt,
    durationFromMeta,
    freezeClock,
    now,
  });
  const progressStaleMs =
    progressUpdatedAt != null && Number.isFinite(progressUpdatedAt)
      ? Math.max(0, now - progressUpdatedAt)
      : elapsedMs;

  const waitingHuman = state === 'waiting_human';
  const softHintMs = config.softHintMs ?? WHAT_MONITOR_CONFIG.softHintMs;
  const softHintLongMs = config.softHintLongMs ?? WHAT_MONITOR_CONFIG.softHintLongMs;
  const staleThresholdMs = config.progressStaleMs ?? WHAT_MONITOR_CONFIG.progressStaleMs;
  const showSoftHint =
    !waitingHuman &&
    state === 'running' &&
    (substep === 'prepare' || !substep) &&
    elapsedMs >= softHintMs;
  const softHintLong = showSoftHint && elapsedMs >= softHintLongMs;
  const showProgressStale =
    !waitingHuman &&
    state === 'running' &&
    Number.isFinite(staleThresholdMs) &&
    progressStaleMs >= staleThresholdMs;

  const activity = resolveActivity(liveRun, state);
  const showSpinner = state === 'running' || state === 'queued' || state === 'finalizing';
  const errorMessage = resolveRunErrorMessage(liveRun, phaseWhat);

  const copy =
    state === 'finalizing'
      ? {
          titleKey: 'requirements.aiHitlHowFinalizing',
          descriptionKey: 'requirements.aiHitlHowFinalizingDesc',
          titleFallback: 'Saving results',
          descriptionFallback: 'Analysis finished. Writing each section onto the pack.',
        }
      : getWhatStatusCopy({
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
    startedAt,
    completedAt: (() => {
      if (completedAt != null) return completedAt;
      if (!freezeClock) return null;
      if (progressUpdatedAt != null) return progressUpdatedAt;
      if (startedAt != null) return startedAt + elapsedMs;
      return null;
    })(),
    progressStaleMs,
    showProgressStale,
    showSoftHint,
    softHintLong,
    errorMessage,
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

function resolveTimestampMs(...candidates) {
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const ms = new Date(raw).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

export function formatElapsed(ms) {
  const totalSec = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Friendly pack status for Monitor header (no Mongo ids). */
export function formatPackStatusLabel(status, t) {
  const key = String(status || '')
    .trim()
    .toLowerCase();
  const map = {
    draft: ['requirements.phase1Status_draft', 'Nháp'],
    under_review: ['requirements.phase1Status_pending_review', 'Chờ duyệt'],
    approved: ['requirements.phase1Status_approved', 'Đã duyệt'],
    rejected: ['requirements.phase1Status_rejected', 'Từ chối'],
    project_linked: ['requirements.phase1Status_active', 'Đã gắn dự án'],
    changes_requested: ['requirements.phase1Status_changes_requested', 'Cần chỉnh sửa'],
  };
  const entry = map[key];
  if (!entry) return key ? key.replace(/_/g, ' ') : '—';
  if (typeof t === 'function') {
    const v = t(entry[0]);
    if (v && v !== entry[0]) return v;
  }
  return entry[1];
}

export default resolveWhatProgressViewModel;
