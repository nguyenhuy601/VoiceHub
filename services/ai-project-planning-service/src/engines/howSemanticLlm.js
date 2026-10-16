/**
 * Shared HOW semantic LLM invoke — compact JSON, always fallible → caller keeps heuristic.
 * Provider: same as WBS/WHAT — `generateJson` → DashScope when
 * LLM_PROVIDER=openai_compatible|dashscope (not Ollama /api/generate).
 */

const { generateJson, isLlmEnabled, ollamaModel } = require('../runtime/ollamaGenerate');

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_NUM_PREDICT = 480;
const DEFAULT_NUM_CTX = 2048;

function clip(s, max = 120) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function packBrief(pack = {}, { maxFr = 12, maxUc = 8 } = {}) {
  const frs = (pack.functionalRequirements || []).slice(0, maxFr).map((fr, i) => ({
    id: String(fr.externalId || fr.id || `FR-${i + 1}`),
    title: clip(fr.title || fr.name || fr.statement, 80),
  }));
  const ucs = (pack.useCases || []).slice(0, maxUc).map((uc, i) => ({
    id: String(uc.externalId || uc.ucKey || uc.id || `UC-${i + 1}`),
    title: clip(uc.title || uc.name, 80),
  }));
  return {
    project: clip(pack.overview?.name || pack.name, 80),
    frs,
    ucs,
  };
}

function leafTaskBrief(container = {}, max = 40) {
  return (container?.planning?.tasks || [])
    .filter((t) => {
      const level = String(t?.level || 'task').toLowerCase();
      return level === 'task' || level === 'subtask' || !t.level;
    })
    .slice(0, max)
    .map((t) => ({
      id: String(t.id || t.taskId || ''),
      title: clip(t.name || t.title, 80),
      area: clip(t.area, 24),
      role: clip(t.suggestedRoleKey, 32),
    }))
    .filter((t) => t.id);
}

/**
 * @returns {Promise<{ ok: boolean, data: object|null, meta: object }>}
 */
async function invokeHowSemanticLlm({
  system,
  user,
  env = process.env,
  generateJsonFn = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  numPredict = DEFAULT_NUM_PREDICT,
  numCtx = DEFAULT_NUM_CTX,
} = {}) {
  if (!isLlmEnabled(env)) {
    return { ok: false, data: null, meta: { fallbackReason: 'llm_disabled' } };
  }
  const gen = generateJsonFn || generateJson;
  const prompt = [String(system || '').trim(), String(user || '').trim()]
    .filter(Boolean)
    .join('\n\n');
  try {
    const out = await gen({
      prompt,
      env,
      timeoutMs,
      numPredict,
      numCtx,
      temperature: 0.2,
    });
    if (!out?.ok || !out.data || typeof out.data !== 'object') {
      return {
        ok: false,
        data: null,
        meta: {
          fallbackReason:
            out?.error || (out?.skipped ? 'llm_skipped' : 'parse_empty'),
          model: out?.model || ollamaModel(env),
        },
      };
    }
    return {
      ok: true,
      data: out.data,
      meta: {
        model: out.model || ollamaModel(env),
        llmCalls: 1,
        usage: out.usage || null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      meta: {
        fallbackReason: 'llm_error',
        error: String(err?.message || err).slice(0, 160),
        model: ollamaModel(env),
      },
    };
  }
}

module.exports = {
  invokeHowSemanticLlm,
  packBrief,
  leafTaskBrief,
  clip,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_NUM_PREDICT,
};
