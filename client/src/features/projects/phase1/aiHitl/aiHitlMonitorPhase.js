/**
 * AI HITL Monitor — resolve which phase checklist to show + step catalogs.
 * RULE-M01: one phase block at a time.
 * WHAT primary UX = WHAT_MACRO_STEPS (see whatProgressViewModel); flat list for index helpers.
 */

import { WHAT_MACRO_STEPS } from './whatProgressViewModel.js';

export { WHAT_MACRO_STEPS };

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

/** HOW agent nodes + G18 tools (mirror jobToToolsMap / agentLoopRunner) */
export const HOW_MONITOR_STEPS = Object.freeze([
  { id: 'understand', labelKey: 'requirements.aiHitlHowStep_understand', fallback: 'Understand scope' },
  { id: 'select', labelKey: 'requirements.aiHitlHowStep_select', fallback: 'Select tools' },
  { id: 'WbsTool', labelKey: 'requirements.aiHitlHowStep_WbsTool', fallback: 'WBS' },
  { id: 'DependencyTool', labelKey: 'requirements.aiHitlHowStep_DependencyTool', fallback: 'Dependencies' },
  { id: 'ArchitectureTool', labelKey: 'requirements.aiHitlHowStep_ArchitectureTool', fallback: 'Architecture' },
  { id: 'RiskTool', labelKey: 'requirements.aiHitlHowStep_RiskTool', fallback: 'Risks' },
  { id: 'EffortTool', labelKey: 'requirements.aiHitlHowStep_EffortTool', fallback: 'Effort' },
  { id: 'SequencingTool', labelKey: 'requirements.aiHitlHowStep_SequencingTool', fallback: 'Sequencing' },
  { id: 'EmployeeMatchingTool', labelKey: 'requirements.aiHitlHowStep_EmployeeMatchingTool', fallback: 'Staff matching' },
  { id: 'ScheduleTool', labelKey: 'requirements.aiHitlHowStep_ScheduleTool', fallback: 'Schedule' },
  { id: 'observe', labelKey: 'requirements.aiHitlHowStep_observe', fallback: 'Observe results' },
  { id: 'evaluateLocal', labelKey: 'requirements.aiHitlHowStep_evaluateLocal', fallback: 'Local evaluate' },
  { id: 'feasibility', labelKey: 'requirements.aiHitlHowStep_feasibility', fallback: 'Feasibility' },
  { id: 'ProjectPlanTool', labelKey: 'requirements.aiHitlHowStep_ProjectPlanTool', fallback: 'Project plan (Gate 2)' },
]);

const IN_FLIGHT = new Set(['pending', 'running', 'waiting_human', 'stopped']);
const READY = new Set(['ready', 'completed', 'confirmed']);

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

  if (isReady(howSt) || pack === 'project_linked') {
    return 'how_done';
  }

  if (isReady(whatSt) || pack === 'under_review' || pack === 'approved') {
    return 'what_done';
  }

  return 'idle';
}

function matchHowStepIndex(steps, nodeRaw) {
  const node = String(nodeRaw || '').trim();
  if (!node) return -1;
  const lower = node.toLowerCase();
  let idx = steps.findIndex((s) => s.id.toLowerCase() === lower);
  if (idx >= 0) return idx;
  idx = steps.findIndex((s) => {
    const id = s.id.toLowerCase();
    const bare = id.replace(/tool$/, '');
    const nodeBare = lower.replace(/tool$/, '');
    return bare === nodeBare || id === `${lower}tool` || bare === lower;
  });
  return idx;
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
    const node =
      liveRun?.currentNode || liveRun?.stage || liveRun?.pipelineSubstep || phaseMeta?.stage || '';
    const idx = matchHowStepIndex(HOW_MONITOR_STEPS, node);
    if (idx >= 0) return idx;
    return isInFlight(phaseStatus(phaseMeta)) || isInFlight(norm(liveRun?.status)) ? 0 : -1;
  }

  if (phase === 'what_done') return WHAT_MONITOR_STEPS.length - 1;
  if (phase === 'how_done') return HOW_MONITOR_STEPS.length - 1;
  return -1;
}

/**
 * @returns {'pending'|'current'|'done'}
 */
export function stepVisualState(stepIndex, activeIndex, phaseDone = false) {
  if (phaseDone) return 'done';
  if (activeIndex < 0) return 'pending';
  if (stepIndex < activeIndex) return 'done';
  if (stepIndex === activeIndex) return 'current';
  return 'pending';
}
