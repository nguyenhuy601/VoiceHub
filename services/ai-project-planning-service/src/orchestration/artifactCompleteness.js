/**
 * Artifact-first completeness (RULE-LG-05/06).
 * WHAT ready = đã chạy đủ catalog tool (FR + mọi section peer), không chỉ có FR.
 */

const { CANONICAL_ORDER: WHAT_REQUIRED_TOOLS } = require('./whatToolDag');

const STOP_INCOMPLETE = 'INCOMPLETE_ARTIFACT';

function envMaxEnrich(env = process.env) {
  const n = Number(env.AGENT_MAX_ENRICH);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  // Enough loops to cover full WHAT catalog after an early agent "done".
  return Math.max(4, WHAT_REQUIRED_TOOLS.length + 2);
}

/**
 * @param {object} state
 * @param {'what'|'how'} phase
 */
function scoreArtifactCompleteness(state, phase) {
  if (phase === 'how') {
    return scoreHowCompleteness(state);
  }
  return scoreWhatCompleteness(state);
}

function successfulWhatTools(state) {
  const done = new Set();
  for (const row of Array.isArray(state?.toolResults) ? state.toolResults : []) {
    if (!row || row.error) continue;
    const name = String(row.toolName || '').trim();
    if (name) done.add(name);
  }
  return done;
}

/** Catalog tools that must succeed before WHAT emitReady. */
function requiredWhatTools() {
  return [...WHAT_REQUIRED_TOOLS];
}

function scoreWhatCompleteness(state) {
  const proposal = state?.srsProposal || state?.container?.analyses?.srsProposal || null;
  const generated = proposal?.generated || {};
  const fr = generated.functionalRequirements?.items || [];
  const thin = [];
  const done = successfulWhatTools(state);
  const missingTools = requiredWhatTools().filter((name) => !done.has(name));

  const uc = generated.useCases?.items || generated.useCase?.items || [];
  if (fr.length && !uc.length) thin.push('useCases');

  const readyForGate1 = Boolean(proposal?.completeness?.readyForGate1);
  const missingForGate1 = Array.isArray(proposal?.completeness?.missingForGate1)
    ? proposal.completeness.missingForGate1
    : [];

  // Keep gate1 soft gaps as thin (do not block emit by themselves once tools ran).
  for (const m of missingForGate1) {
    const key = typeof m === 'string' ? m : m?.area || m?.section;
    if (key && !thin.includes(String(key))) thin.push(String(key));
  }

  if (!fr.length && !done.has('WhatFrTool')) {
    if (!thin.includes('functionalRequirements')) thin.push('functionalRequirements');
  }

  const finalReady = missingTools.length === 0;

  return {
    phase: 'what',
    ready: finalReady,
    thin: !finalReady || thin.length > 0,
    missing: missingTools,
    thinAreas: thin,
    unresolvedCount: Array.isArray(proposal?.unresolvedRefs)
      ? proposal.unresolvedRefs.length
      : 0,
    readyForGate1: Boolean(readyForGate1),
    frCount: fr.length,
    requiredToolCount: WHAT_REQUIRED_TOOLS.length,
    doneToolCount: WHAT_REQUIRED_TOOLS.filter((n) => done.has(n)).length,
  };
}

function isHowLeafTask(task) {
  const level = String(task?.level || 'task').toLowerCase();
  return (
    level !== 'epic' &&
    level !== 'feature' &&
    level !== 'story' &&
    level !== 'work_package'
  );
}

function scoreHowCompleteness(state) {
  const tasks = Array.isArray(state?.container?.planning?.tasks)
    ? state.container.planning.tasks
    : [];
  const leafTasks = tasks.filter(isHowLeafTask);
  const wbs =
    state?.container?.planning?.wbs ||
    state?.container?.planning?.wbsTree ||
    null;
  const wbsLeafCount = Number(wbs?.taskCount);
  const hasLeafTasks =
    leafTasks.length > 0 || (Number.isFinite(wbsLeafCount) && wbsLeafCount > 0);
  // Empty `{ roots:[], nodes:[], taskCount:0 }` must NOT count as ready.
  const hasMeaningfulWbs =
    (Array.isArray(wbs) && wbs.length > 0) ||
    (wbs &&
      typeof wbs === 'object' &&
      ((Array.isArray(wbs.nodes) && wbs.nodes.length > 0) ||
        (Number.isFinite(wbsLeafCount) && wbsLeafCount > 0)));
  const { succeededValidatedTools, failedTools } = require('./toolExecutionContract');
  const succeeded = succeededValidatedTools(state);
  const failed = failedTools(state);
  const toolOk = (name) => succeeded.has(name);
  const wbsFailed = failed.has('WbsTool');
  const wbsOk = toolOk('WbsTool');
  const dependencyOk = toolOk('DependencyTool');
  const scheduleOk = toolOk('ScheduleTool');
  const planOk = Boolean(state?.planManifest?.status === 'ready_for_review');

  const missing = [];
  if (!hasLeafTasks) missing.push('wbs_task_leaves');
  if (wbsFailed || (!wbsOk && !hasLeafTasks)) missing.push('WbsTool');
  if (hasLeafTasks && !dependencyOk) missing.push('DependencyTool');
  if (hasLeafTasks && !scheduleOk) missing.push('ScheduleTool');
  if (!planOk && !hasLeafTasks) missing.push('planning_tools');

  // Gate2 Phụ thuộc / Phân công / Lịch need Dependency + Schedule (matching folds into Schedule).
  const ready =
    hasLeafTasks &&
    !wbsFailed &&
    (wbsOk || hasMeaningfulWbs) &&
    dependencyOk &&
    scheduleOk;
  return {
    phase: 'how',
    ready,
    thin: !ready,
    missing,
    thinAreas: [],
    unresolvedCount: 0,
    readyForGate2: ready,
    taskCount: leafTasks.length,
    leafTaskCount: leafTasks.length,
  };
}

function buildGapReport(score, state = {}) {
  const missing = Array.isArray(score?.missing) ? score.missing : [];
  const thin = Array.isArray(score?.thinAreas) ? score.thinAreas : [];
  const hintParts = [];
  if (missing.length) hintParts.push(`Missing: ${missing.join(', ')}`);
  if (thin.length) hintParts.push(`Thin: ${thin.join(', ')}`);
  if (!hintParts.length) {
    hintParts.push('Artifact incomplete for gate readiness; call tools to enrich.');
  }
  return {
    missing,
    thin,
    unresolvedCount: Number(score?.unresolvedCount) || 0,
    hint: hintParts.join('. '),
    enrichLoop: Number(state.enrichLoop) || 0,
    phase: score?.phase || null,
  };
}

function gapReportToMessage(gapReport) {
  const g = gapReport && typeof gapReport === 'object' ? gapReport : {};
  const missing = Array.isArray(g.missing) ? g.missing.filter(Boolean) : [];
  const toolHint = missing.length
    ? `Còn thiếu tool: ${missing.join(', ')}. `
    : '';
  return {
    role: 'user',
    content:
      `Artifact chưa đủ để Gate. ${toolHint}${g.hint || ''}\n` +
      `Hãy gọi đúng các tool còn thiếu (thứ tự tự do). ` +
      `Chỉ dừng khi đã chạy đủ catalog WHAT.`,
  };
}

/**
 * @returns {'injectGap'|'emitReady'|'emitIncomplete'}
 */
function routeAfterCompleteness(state, opts = {}) {
  const maxEnrich = opts.maxEnrich != null ? opts.maxEnrich : envMaxEnrich(opts.env);
  const score = state.completeness || {};
  const enrichLoop = Number(state.enrichLoop) || 0;
  const stop = String(state.stopReason || '');
  const budgetStop = stop.startsWith('BUDGET_');
  let deadlockStop = false;
  try {
    const {
      isHowDeadlockStopReason,
      detectHowSelectDeadlock,
    } = require('./computeEligibleHowTools');
    deadlockStop = isHowDeadlockStopReason(stop);
    // Defense: assemble path without stopReason still must not injectGap on deadlock.
    if (!deadlockStop && score.phase === 'how') {
      deadlockStop = Boolean(detectHowSelectDeadlock(state).deadlocked);
    }
  } catch {
    deadlockStop =
      stop === 'HOW_NO_ELIGIBLE_PROGRESS' ||
      stop === 'HOW_DEPENDENCY_NOT_SCHEDULE_READY' ||
      stop.startsWith('HOW_NO_ELIGIBLE');
  }
  try {
    const {
      isWhatWaitingFrStopReason,
      isWaitingFrConfirmOnly,
    } = require('./computeEligibleWhatTools');
    if (
      isWhatWaitingFrStopReason(stop) ||
      (score.phase === 'what' && isWaitingFrConfirmOnly(state))
    ) {
      deadlockStop = true;
    }
  } catch {
    if (stop === 'WHAT_WAITING_FR_CONFIRM') deadlockStop = true;
  }
  let hardToolStop = stop === 'TOOL_FAILED' || stop.startsWith('TOOL_FAILED:');
  if (!hardToolStop) {
    try {
      const { hasPhaseHardToolStop } = require('./howPhaseToolNodes');
      hardToolStop = hasPhaseHardToolStop(state);
    } catch {
      hardToolStop = (Array.isArray(state.toolResults) ? state.toolResults : []).some(
        (row) => row?.error
      );
    }
  }

  if (score.ready && !hardToolStop) return 'emitReady';
  // Fail-fast: do not injectGap / retry after hard tool failure, budget, or HOW deadlock.
  if (hardToolStop || budgetStop || deadlockStop || enrichLoop >= maxEnrich) {
    return 'emitIncomplete';
  }
  return 'injectGap';
}

module.exports = {
  STOP_INCOMPLETE,
  envMaxEnrich,
  scoreArtifactCompleteness,
  scoreWhatCompleteness,
  scoreHowCompleteness,
  requiredWhatTools,
  successfulWhatTools,
  buildGapReport,
  gapReportToMessage,
  routeAfterCompleteness,
};
