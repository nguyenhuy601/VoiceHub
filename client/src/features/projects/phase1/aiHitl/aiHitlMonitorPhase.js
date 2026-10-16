/**
 * AI HITL Monitor — resolve which phase checklist to show + step catalogs.
 * RULE-M01: one phase block at a time.
 * WHAT primary UX = WHAT_MACRO_STEPS (see whatProgressViewModel); flat list for index helpers.
 * HOW primary UX = HOW_MACRO_STEPS (see howProgressViewModel).
 */

import { WHAT_MACRO_STEPS } from './whatProgressViewModel.js';
import {
  HOW_MACRO_STEPS,
  HOW_MONITOR_STEPS,
  matchHowStepIndex,
  resolveHowActiveStepId,
} from './howProgressViewModel.js';

export { WHAT_MACRO_STEPS, HOW_MACRO_STEPS, HOW_MONITOR_STEPS };

/** Flat G4 WHAT substeps (mirror APS pipelineProgress.js) — not primary Monitor UI */
export const WHAT_MONITOR_STEPS = Object.freeze(
  WHAT_MACRO_STEPS.flatMap((m) =>
    m.substeps.map((id) => ({
      id,
      labelKey: `requirements.phase1Substep_${id}`,
      fallback: id,
    }))
  )
);

const IN_FLIGHT = new Set(['pending', 'running', 'queued', 'waiting_human', 'stopped']);
const READY = new Set(['ready', 'completed', 'confirmed']);
/** Keep Monitor on the phase that just failed — do not drop to idle. */
const TERMINAL_FAIL = new Set(['failed', 'cancelled', 'error']);

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function phaseStatus(meta) {
  return norm(meta?.status);
}

function isInFlight(status) {
  return IN_FLIGHT.has(status);
}

function isReady(status) {
  return READY.has(status);
}

/**
 * @returns {'idle'|'what'|'how'|'what_done'|'how_done'}
 */
export function resolveAiHitlMonitorPhase({
  packStatus = '',
  phaseWhat = null,
  phaseHow = null,
  liveRun = null,
} = {}) {
  const whatSt = phaseStatus(phaseWhat);
  const howSt = phaseStatus(phaseHow);
  const liveSt = norm(liveRun?.status);
  const gate = norm(liveRun?.gate);
  const pack = norm(packStatus);

  // RULE-M04 / RULE-M05: WHAT in-flight (incl. data gate) wins over HOW
  if (
    isInFlight(whatSt) ||
    (liveSt === 'waiting_human' && gate === 'data_review')
  ) {
    return 'what';
  }

  if (isInFlight(howSt)) {
    return 'how';
  }

  // Live run still active after pack approved → HOW (what already done)
  if (isInFlight(liveSt) && (pack === 'approved' || pack === 'project_linked')) {
    return 'how';
  }

  // Live run active before approve → treat as WHAT
  if (isInFlight(liveSt)) {
    return 'what';
  }

  // Terminal fail/cancel: stay on the phase that ran (P0 Monitor UX)
  if (
    TERMINAL_FAIL.has(howSt) ||
    (TERMINAL_FAIL.has(liveSt) && (pack === 'approved' || pack === 'project_linked'))
  ) {
    return 'how';
  }
  if (TERMINAL_FAIL.has(whatSt) || TERMINAL_FAIL.has(liveSt)) {
    return 'what';
  }

  if (isReady(howSt) || pack === 'project_linked') {
    return 'how_done';
  }

  // After PO Gate1 approve — Monitor shows Phase HOW (even before how starts)
  if (pack === 'approved') {
    return 'how';
  }

  if (isReady(whatSt) || pack === 'under_review') {
    return 'what_done';
  }

  return 'idle';
}

/**
 * Which results table to show under Monitor progress (RULE-M01 — never both).
 * @param {'idle'|'what'|'how'|'what_done'|'how_done'} phase
 * @param {boolean} [showHowReady] — WHAT done + Gate1 approved, HOW checklist ready (no WHAT results)
 * @returns {'what'|'how'|null}
 */
export function resolveMonitorResultsKind(phase, showHowReady = false) {
  if (phase === 'how' || phase === 'how_done') return 'how';
  if (phase === 'what' || (phase === 'what_done' && !showHowReady)) return 'what';
  return null;
}

/**
 * Active step index within the phase catalog (−1 if unknown / idle).
 * @param {'idle'|'what'|'how'|'what_done'|'how_done'} phase
 */
export function resolveActiveStepIndex(phase, liveRun = null, phaseMeta = null) {
  if (phase === 'what') {
    // Prefer explicit pipelineSubstep; do not treat currentNode as business progress
    let sub = String(liveRun?.pipelineSubstep || phaseMeta?.pipelineSubstep || '').trim();
    if (sub === 'feasibility') sub = 'meta_gate';
    if (!sub && norm(liveRun?.gate) === 'data_review') sub = 'quality';
    if (!sub) {
      return isInFlight(phaseStatus(phaseMeta)) || isInFlight(norm(liveRun?.status)) ? 0 : -1;
    }
    const idx = WHAT_MONITOR_STEPS.findIndex((s) => s.id === sub);
    return idx >= 0 ? idx : 0;
  }

  if (phase === 'how') {
    const stepId = resolveHowActiveStepId(liveRun, phaseMeta);
    if (stepId) {
      const idx = matchHowStepIndex(stepId);
      if (idx >= 0) return idx;
    }
    return isInFlight(phaseStatus(phaseMeta)) || isInFlight(norm(liveRun?.status)) ? 0 : -1;
  }

  if (phase === 'what_done') return WHAT_MONITOR_STEPS.length - 1;
  if (phase === 'how_done') return HOW_MONITOR_STEPS.length - 1;
  return -1;
}

/**
 * @param {number} stepIndex
 * @param {number} activeIndex — primary active (min of parallel set when multi)
 * @param {boolean} [phaseDone]
 * @param {number[]|null} [activeIndices] — all in-flight indices (parallel HOW tools)
 * @returns {'pending'|'current'|'done'}
 */
export function stepVisualState(stepIndex, activeIndex, phaseDone = false, activeIndices = null) {
  if (phaseDone) return 'done';
  if (Array.isArray(activeIndices) && activeIndices.length > 0) {
    if (activeIndices.includes(stepIndex)) return 'current';
    const minActive = Math.min(...activeIndices);
    if (stepIndex < minActive) return 'done';
    return 'pending';
  }
  if (activeIndex < 0) return 'pending';
  if (stepIndex < activeIndex) return 'done';
  if (stepIndex === activeIndex) return 'current';
  return 'pending';
}
