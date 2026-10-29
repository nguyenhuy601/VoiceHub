/**
 * Code-side HOW eligibility — LLM may only bind these tools (no soft-deps rewrite).
 */

const {
  HOW_TOOL_DEPENDENCIES,
  CANONICAL_ORDER,
  howToolDepsSatisfied,
} = require('./howToolDag');
const {
  succeededValidatedTools,
  latestExecutionByTool,
  attemptCountForTool,
} = require('./toolExecutionContract');

const DEFAULT_MAX_ATTEMPTS = 3;

/** LangGraph fail-fast: no eligible tool and required path blocked — do not injectGap. */
const STOP_HOW_NO_ELIGIBLE_PROGRESS = 'HOW_NO_ELIGIBLE_PROGRESS';
const STOP_HOW_DEPENDENCY_NOT_SCHEDULE_READY = 'HOW_DEPENDENCY_NOT_SCHEDULE_READY';

/** ReAct catalog — ProjectPlan is graph finalizePlan, not LLM-selectable. */
function howReactCatalogTools() {
  return CANONICAL_ORDER.filter((name) => name !== 'ProjectPlanTool');
}

/**
 * True when stopReason is a HOW select deadlock (prefix HOW_ to avoid WHAT collision).
 * @param {string|null|undefined} stopReason
 */
function isHowDeadlockStopReason(stopReason) {
  const stop = String(stopReason || '');
  return (
    stop === STOP_HOW_NO_ELIGIBLE_PROGRESS ||
    stop === STOP_HOW_DEPENDENCY_NOT_SCHEDULE_READY ||
    stop.startsWith('HOW_NO_ELIGIBLE')
  );
}

/**
 * Defense when toolExecutions were dropped after a successful WbsTool write.
 * Mirrors artifactCompleteness hasLeafTasks / hasMeaningfulWbs.
 * @param {object} state
 */
function hasWbsLeavesInContainer(state) {
  const tasks = Array.isArray(state?.container?.planning?.tasks)
    ? state.container.planning.tasks
    : [];
  if (tasks.some((t) => t && (t.level === 'task' || t.type === 'task'))) return true;
  const wbs = state?.container?.planning?.wbs || state?.container?.planning?.wbsTree;
  const count = Number(wbs?.taskCount);
  if (Number.isFinite(count) && count > 0) return true;
  if (Array.isArray(wbs?.nodes) && wbs.nodes.length > 0) return true;
  return false;
}

function dependencyAnalysisFlags(state) {
  const dep = state?.container?.analyses?.dependency || {};
  return {
    executionTerminal: Boolean(dep.executionTerminal ?? dep.meta?.executionTerminal),
    scheduleReady: Boolean(dep.scheduleReady ?? dep.meta?.scheduleReady),
    analysisComplete: Boolean(dep.analysisComplete ?? dep.meta?.analysisComplete),
    analysisStatus: dep.analysisStatus || dep.meta?.analysisStatus || null,
  };
}

/**
 * succeededValidatedTools + container fallback for WbsTool (ReAct loop guard).
 * DependencyTool: executionTerminal on container also counts as "done" for Risk soft-deps
 * (SKIPPED/FAILED/PARTIAL still unlock Risk; Schedule checks scheduleReady separately).
 * @param {object} state
 * @returns {Set<string>}
 */
function howSucceededTools(state) {
  const done = new Set(succeededValidatedTools(state));
  if (!done.has('WbsTool') && hasWbsLeavesInContainer(state)) {
    done.add('WbsTool');
  }
  if (!done.has('DependencyTool')) {
    const flags = dependencyAnalysisFlags(state);
    if (flags.executionTerminal) done.add('DependencyTool');
    else {
      const latest = latestExecutionByTool(
        Array.isArray(state?.toolExecutions) ? state.toolExecutions : []
      );
      const row = latest.get('DependencyTool');
      if (row && (row.status === 'succeeded' || row.status === 'skipped' || row.status === 'failed')) {
        done.add('DependencyTool');
      }
    }
  }
  return done;
}

/**
 * @param {object} state
 * @param {{ maxAttempts?: number, catalog?: string[] }} [opts]
 * @returns {{ eligible: string[], blocked: Array<{ toolName: string, blockedBy: string[] }>, running: string[] }}
 */
function computeEligibleHowTools(state, opts = {}) {
  const catalog = Array.isArray(opts.catalog) ? opts.catalog : howReactCatalogTools();
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || DEFAULT_MAX_ATTEMPTS);
  const done = howSucceededTools(state);
  const latest = latestExecutionByTool(
    Array.isArray(state?.toolExecutions) ? state.toolExecutions : []
  );

  const eligible = [];
  const blocked = [];
  const running = [];

  for (const toolName of catalog) {
    if (done.has(toolName)) continue;

    const row = latest.get(toolName);
    if (row?.status === 'running' || row?.status === 'waiting_external') {
      running.push(toolName);
      continue;
    }

    const attempts = attemptCountForTool(state, toolName);
    if (attempts >= maxAttempts) {
      blocked.push({
        toolName,
        blockedBy: [`retry_exhausted:${attempts}`],
      });
      continue;
    }

    if (!howToolDepsSatisfied(toolName, done)) {
      const deps = HOW_TOOL_DEPENDENCIES[toolName] || [];
      blocked.push({
        toolName,
        blockedBy: deps.filter((d) => !done.has(d)),
      });
      continue;
    }

    // Staged WBS checkpoint: block all dependents until wbsBaselineRevisionId is pinned.
    if (toolName !== 'WbsTool') {
      const {
        isWbsCheckpointEnabled,
        needsWbsConfirm,
      } = require('../planningRevision/wbsCheckpoint');
      if (isWbsCheckpointEnabled() && needsWbsConfirm(state)) {
        blocked.push({
          toolName,
          blockedBy: ['wbs_baseline_confirm'],
        });
        continue;
      }
    }

    // Schedule requires dependency scheduleReady (not merely DependencyTool terminal).
    if (toolName === 'ScheduleTool') {
      const flags = dependencyAnalysisFlags(state);
      if (!flags.scheduleReady) {
        blocked.push({
          toolName,
          blockedBy: ['dependency_scheduleReady'],
        });
        continue;
      }
    }

    eligible.push(toolName);
  }

  return { eligible, blocked, running };
}

function isHowReadyForFinalize(state, opts = {}) {
  const required = Array.isArray(opts.required)
    ? opts.required
    : ['WbsTool', 'DependencyTool', 'ScheduleTool'];
  const done = howSucceededTools(state);
  return required.every((name) => done.has(name));
}

/**
 * LangGraph deadlock: nothing eligible/running and Gate2 required tools not satisfied.
 * Typical: Dependency terminal with scheduleReady=false → Schedule permanently blocked.
 *
 * @param {object} state
 * @param {{ maxAttempts?: number, catalog?: string[], required?: string[] }} [opts]
 * @returns {{
 *   deadlocked: boolean,
 *   reason: string|null,
 *   blocked: Array<{ toolName: string, blockedBy: string[] }>,
 *   eligible: string[],
 *   running: string[],
 * }}
 */
function detectHowSelectDeadlock(state, opts = {}) {
  if (isHowReadyForFinalize(state, opts)) {
    return {
      deadlocked: false,
      reason: null,
      blocked: [],
      eligible: [],
      running: [],
    };
  }

  const { eligible, blocked, running } = computeEligibleHowTools(state, opts);
  if (eligible.length || running.length) {
    return {
      deadlocked: false,
      reason: null,
      blocked,
      eligible,
      running,
    };
  }

  const done = howSucceededTools(state);
  const scheduleBlock = blocked.find(
    (b) =>
      b.toolName === 'ScheduleTool' &&
      Array.isArray(b.blockedBy) &&
      b.blockedBy.includes('dependency_scheduleReady')
  );
  const reason =
    scheduleBlock && done.has('DependencyTool')
      ? STOP_HOW_DEPENDENCY_NOT_SCHEDULE_READY
      : STOP_HOW_NO_ELIGIBLE_PROGRESS;

  return {
    deadlocked: true,
    reason,
    blocked,
    eligible,
    running,
  };
}

module.exports = {
  howReactCatalogTools,
  computeEligibleHowTools,
  isHowReadyForFinalize,
  detectHowSelectDeadlock,
  isHowDeadlockStopReason,
  hasWbsLeavesInContainer,
  howSucceededTools,
  dependencyAnalysisFlags,
  DEFAULT_MAX_ATTEMPTS,
  STOP_HOW_NO_ELIGIBLE_PROGRESS,
  STOP_HOW_DEPENDENCY_NOT_SCHEDULE_READY,
};
