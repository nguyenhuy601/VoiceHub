/**
 * G18 Tool Registry — SoT for tool descriptors + policy enforcement.
 */

const registry = new Map();

function registerTool(descriptor) {
  if (!descriptor || !descriptor.toolName) {
    throw new Error('toolName is required');
  }
  const name = String(descriptor.toolName);
  registry.set(name, {
    toolName: name,
    version: descriptor.version || '1.0.0',
    description: descriptor.description || '',
    inputSchema: descriptor.inputSchema || {},
    outputSchema: descriptor.outputSchema || {},
    evidenceSchema: descriptor.evidenceSchema || {},
    permissions: descriptor.permissions || [],
    allowedContexts: Array.isArray(descriptor.allowedContexts)
      ? descriptor.allowedContexts
      : ['planning'],
    requires: Array.isArray(descriptor.requires) ? descriptor.requires : [],
    timeout: Number(descriptor.timeout) || 30_000,
    retryPolicy: descriptor.retryPolicy || { maxRetries: 0 },
    execute: typeof descriptor.execute === 'function' ? descriptor.execute : null,
  });
  return registry.get(name);
}

function getTool(toolName) {
  return registry.get(String(toolName)) || null;
}

function listTools() {
  return Array.from(registry.values()).map(({ execute, ...rest }) => rest);
}

function clearRegistry() {
  registry.clear();
}

/**
 * Resolve + policy-check before execute.
 * @throws Error with code TOOL_NOT_REGISTERED | TOOL_CONTEXT_DENIED | TOOL_REQUIRES_MISSING
 */
function resolveTool(toolName, context = {}) {
  const tool = getTool(toolName);
  if (!tool) {
    const err = new Error(`Unknown tool: ${toolName}`);
    err.code = 'TOOL_NOT_REGISTERED';
    throw err;
  }

  const ctx = context.contextName || context.allowedContext || 'planning';
  if (tool.allowedContexts.length && !tool.allowedContexts.includes(ctx)) {
    const err = new Error(`Tool ${toolName} not allowed in context ${ctx}`);
    err.code = 'TOOL_CONTEXT_DENIED';
    throw err;
  }

  for (const req of tool.requires) {
    const key = String(req);
    const present =
      context[key] != null ||
      (context.requiresSatisfied && context.requiresSatisfied[key]);
    if (!present) {
      const err = new Error(`Tool ${toolName} requires: ${key}`);
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
  registerTool,
  getTool,
  listTools,
  clearRegistry,
  resolveTool,
  invokeTool,
};
