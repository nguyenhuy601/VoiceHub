/**
 * Tool lookup + invoke — backed by static planningToolCatalog (no boot register).
 */

const {
  getPlanningTool,
  listPlanningTools,
} = require('../tools/planningToolCatalog');
const {
  isHowSecPhaseOnly,
  isWhatSectionPhaseOnly,
  assertPhaseGraphOnly,
} = require('../orchestration/phaseGraphOnly');

function getTool(toolName) {
  return getPlanningTool(toolName);
}

function listTools() {
  return listPlanningTools();
}

/**
 * Resolve + policy-check before execute.
 * @throws Error with code TOOL_NOT_REGISTERED | TOOL_CONTEXT_DENIED | TOOL_REQUIRES_MISSING | PHASE_GRAPH_ONLY
 */
function resolveTool(toolName, context = {}) {
  const name = String(toolName || '');
  if (isHowSecPhaseOnly(name)) assertPhaseGraphOnly(name, 'how');
  if (isWhatSectionPhaseOnly(name)) assertPhaseGraphOnly(name, 'what');

  const tool = getTool(name);
  if (!tool) {
    const err = new Error(`Unknown tool: ${name}`);
    err.code = 'TOOL_NOT_REGISTERED';
    throw err;
  }

  const ctx = context.contextName || context.allowedContext || 'planning';
  if (tool.allowedContexts.length && !tool.allowedContexts.includes(ctx)) {
    const err = new Error(`Tool ${name} not allowed in context ${ctx}`);
    err.code = 'TOOL_CONTEXT_DENIED';
    throw err;
  }

  for (const req of tool.requires) {
    const key = String(req);
    const present =
      context[key] != null ||
      (context.requiresSatisfied && context.requiresSatisfied[key]);
    if (!present) {
      const err = new Error(`Tool ${name} requires: ${key}`);
      err.code = 'TOOL_REQUIRES_MISSING';
      err.missing = key;
      throw err;
    }
  }

  return tool;
}

async function invokeTool(toolName, input, context = {}) {
  const tool = resolveTool(toolName, context);
  if (!tool.execute) {
    const err = new Error(`Tool ${toolName} has no execute handler`);
    err.code = 'TOOL_NO_HANDLER';
    throw err;
  }

  const timeoutMs = Math.max(1, Number(tool.timeout) || 30_000);
  const maxRetries = Math.max(
    0,
    Number(tool.retryPolicy?.maxRetries != null ? tool.retryPolicy.maxRetries : 0)
  );

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    attempt += 1;
    let timer = null;
    try {
      const result = await Promise.race([
        Promise.resolve(tool.execute(input, context)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error(`Tool ${toolName} timed out after ${timeoutMs}ms`);
            err.code = 'TOOL_TIMEOUT';
            err.timeoutMs = timeoutMs;
            reject(err);
          }, timeoutMs);
          if (typeof timer.unref === 'function') timer.unref();
        }),
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastErr = err;
      if (attempt > maxRetries) break;
    }
  }
  throw lastErr;
}

module.exports = {
  getTool,
  listTools,
  resolveTool,
  invokeTool,
};
