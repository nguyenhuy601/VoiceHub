/**
 * Track B — Agent budget / timeout / stop (Layer B, pure-JS; ≠ LangGraph F2).
 * G8 Evaluate decides CONTINUE|RETRIEVE|NEED_TOOL; budget can force STOP.
 */

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_WALL_MS = 300_000;
const DEFAULT_MAX_TOOL_CALLS = 40;

const STOP_REASONS = Object.freeze({
  CONTINUE: 'CONTINUE',
  BUDGET_ITERATION: 'BUDGET_ITERATION',
  BUDGET_WALL: 'BUDGET_WALL',
  BUDGET_TOOLS: 'BUDGET_TOOLS',
  EVALUATE_CONTINUE: 'EVALUATE_CONTINUE',
  COMPLETE: 'COMPLETE',
});

function envFlagOn(raw, defaultOn = true) {
  if (raw == null || String(raw).trim() === '') return defaultOn;
  const v = String(raw).trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function readPositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, budget?: object }} [opts]
 * @returns {{
 *   enforce: boolean,
 *   maxIterations: number,
 *   wallMs: number,
 *   maxToolCalls: number,
 * }}
 */
function resolveAgentBudget(opts = {}) {
  const env = opts.env || process.env;
  const override =
    opts.budget && typeof opts.budget === 'object' && !Array.isArray(opts.budget)
      ? opts.budget
      : {};

  return {
    enforce: envFlagOn(
      override.enforce != null ? override.enforce : env.AGENT_BUDGET_ENFORCE,
      true
    ),
    maxIterations: readPositiveInt(
      override.maxIterations ?? env.AGENT_MAX_ITERATIONS,
      DEFAULT_MAX_ITERATIONS
    ),
    wallMs: readPositiveInt(override.wallMs ?? env.AGENT_WALL_MS, DEFAULT_WALL_MS),
    maxToolCalls: readPositiveInt(
      override.maxToolCalls ?? env.AGENT_MAX_TOOL_CALLS,
      DEFAULT_MAX_TOOL_CALLS
    ),
  };
}

/**
 * @param {{
 *   budget?: ReturnType<typeof resolveAgentBudget>,
 *   startedAt?: number,
 *   iteration?: number,
 *   toolCallCount?: number,
 *   now?: number,
 * }} input
 * @returns {{
 *   stop: boolean,
 *   reason: string|null,
 *   remaining: { iterations: number, wallMs: number, toolCalls: number },
 * }}
 */
function evaluateStopCondition(input = {}) {
  const budget = input.budget || resolveAgentBudget();
  const startedAt =
    typeof input.startedAt === 'number' && Number.isFinite(input.startedAt)
      ? input.startedAt
      : Date.now();
  const now =
    typeof input.now === 'number' && Number.isFinite(input.now)
      ? input.now
      : Date.now();
  const iteration = Math.max(0, Number(input.iteration) || 0);
  const toolCallCount = Math.max(0, Number(input.toolCallCount) || 0);

  const elapsed = Math.max(0, now - startedAt);
  const remaining = {
    iterations: Math.max(0, budget.maxIterations - iteration),
    wallMs: Math.max(0, budget.wallMs - elapsed),
    toolCalls: Math.max(0, budget.maxToolCalls - toolCallCount),
  };

  if (!budget.enforce) {
    return { stop: false, reason: null, remaining, enforce: false };
  }

  if (iteration >= budget.maxIterations) {
    return {
      stop: true,
      reason: STOP_REASONS.BUDGET_ITERATION,
      remaining,
      enforce: true,
    };
  }
  if (elapsed >= budget.wallMs) {
    return {
      stop: true,
      reason: STOP_REASONS.BUDGET_WALL,
      remaining,
      enforce: true,
    };
  }
  if (toolCallCount >= budget.maxToolCalls) {
    return {
      stop: true,
      reason: STOP_REASONS.BUDGET_TOOLS,
      remaining,
      enforce: true,
    };
  }

  return { stop: false, reason: null, remaining, enforce: true };
}

module.exports = {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_WALL_MS,
  DEFAULT_MAX_TOOL_CALLS,
  STOP_REASONS,
  resolveAgentBudget,
  evaluateStopCondition,
};
