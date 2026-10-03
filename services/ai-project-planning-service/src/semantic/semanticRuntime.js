/**
 * Shared Semantic Runtime — LLM JSON invoke + schema validate + usage meta.
 * Capability only — not a hard dependency of every engine node.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');

/**
 * @param {{
 *   prompt: string,
 *   schemaValidate?: (obj: object) => { ok: boolean, errors?: object[] },
 *   maxTokens?: number,
 *   numCtx?: number,
 *   timeoutMs?: number,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
async function invokeSemanticRuntime(opts = {}) {
  const env = opts.env || process.env;
  if (!isLlmEnabled(env)) {
    return {
      ok: false,
      skipped: true,
      reason: 'LLM_DISABLED',
      data: null,
      usage: null,
      error: null,
    };
  }

  const result = await generateJson({
    prompt: opts.prompt,
    numPredict: opts.maxTokens,
    numCtx: opts.numCtx,
    timeoutMs: opts.timeoutMs,
    env,
  });

  if (!result?.ok || result.data == null) {
    return {
      ok: false,
      skipped: false,
      reason: result?.error || 'RUNTIME_FAILED',
      data: null,
      usage: result?.usage || null,
      error: result?.error || 'runtime_error',
    };
  }

  if (typeof opts.schemaValidate === 'function') {
    const v = opts.schemaValidate(result.data);
    if (!v?.ok) {
      return {
        ok: false,
        skipped: false,
        reason: 'SCHEMA_VALIDATION_FAILED',
        data: result.data,
        usage: result.usage || null,
        error: 'schema_validation',
        validationErrors: v.errors || [],
      };
    }
  }

  return {
    ok: true,
    skipped: false,
    reason: null,
    data: result.data,
    usage: result.usage || null,
    error: null,
  };
}

module.exports = {
  invokeSemanticRuntime,
};
