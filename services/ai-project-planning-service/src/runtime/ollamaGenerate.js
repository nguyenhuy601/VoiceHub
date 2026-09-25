/**
 * G17 — Ollama /api/generate wrapper (JSON extract + usage meta).
 * Does not compute business metrics.
 */

const axios = require('axios');

const DEFAULT_MODEL = 'qwen2.5:3b-instruct';
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_NUM_PREDICT = 512;
const DEFAULT_KEEP_ALIVE = '30m';

function llmProvider(env = process.env) {
  return String(env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
}

function isLlmEnabled(env = process.env) {
  const flag = String(env.AI_PLANNING_LLM ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  return true;
}

function ollamaBaseUrl(env = process.env) {
  return String(env.OLLAMA_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function ollamaModel(env = process.env) {
  return String(env.OLLAMA_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function ollamaKeepAlive(env = process.env) {
  const raw = String(env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE).trim();
  return raw || DEFAULT_KEEP_ALIVE;
}

function extractJsonPayload(text) {
  const raw = String(text || '');
  const objStart = raw.indexOf('{');
  const arrStart = raw.indexOf('[');
  let start = -1;
  let endChar = '';
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    endChar = '}';
  } else if (arrStart >= 0) {
    start = arrStart;
    endChar = ']';
  }
  if (start < 0) return null;
  const end = raw.lastIndexOf(endChar);
  if (end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {{ prompt: string, temperature?: number, timeoutMs?: number, numPredict?: number, numCtx?: number, env?: NodeJS.ProcessEnv, axiosImpl?: object }} opts
 */
async function generateJson(opts = {}) {
  const env = opts.env || process.env;
  const model = ollamaModel(env);
  const http = opts.axiosImpl || axios;

  if (!isLlmEnabled(env) || llmProvider(env) === 'mock') {
    return {
      ok: false,
      model,
      data: null,
      skipped: true,
      error: 'llm_skipped',
      usage: { promptEvalCount: 0, evalCount: 0 },
    };
  }

  const baseUrl = ollamaBaseUrl(env);
  if (!baseUrl) {
    return {
      ok: false,
      model,
      data: null,
      skipped: true,
      error: 'ollama_base_url_missing',
      usage: { promptEvalCount: 0, evalCount: 0 },
    };
  }

  const timeout =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs))
      ? Math.max(5000, Math.min(600000, Number(opts.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
  const predict =
    opts.numPredict != null && Number.isFinite(Number(opts.numPredict))
      ? Math.max(32, Math.min(2048, Math.round(Number(opts.numPredict))))
      : DEFAULT_NUM_PREDICT;
  const options = {
    temperature: opts.temperature != null ? Number(opts.temperature) : 0.1,
    num_predict: predict,
  };
  if (opts.numCtx != null && Number.isFinite(Number(opts.numCtx))) {
    options.num_ctx = Math.max(512, Math.min(32768, Math.round(Number(opts.numCtx))));
  }

  try {
    const res = await http.post(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt: String(opts.prompt || ''),
        stream: false,
        keep_alive: ollamaKeepAlive(env),
        options,
      },
      { timeout, validateStatus: () => true }
    );
    if (!res || res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        model,
        data: null,
        error: `ollama_http_${res?.status || 0}`,
        usage: { promptEvalCount: 0, evalCount: 0 },
      };
    }
    const text = String(res.data?.response || '');
    const data = extractJsonPayload(text);
    const usage = {
      promptEvalCount: Number(res.data?.prompt_eval_count) || 0,
      evalCount: Number(res.data?.eval_count) || 0,
    };
    if (data == null) {
      return { ok: false, model, data: null, error: 'ollama_json_parse', usage };
    }
    return { ok: true, model, data, usage };
  } catch (err) {
    const code = err.code === 'ECONNABORTED' ? 'ollama_timeout' : 'ollama_error';
    return {
      ok: false,
      model,
      data: null,
      error: code,
      usage: { promptEvalCount: 0, evalCount: 0 },
    };
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_NUM_PREDICT,
  llmProvider,
  isLlmEnabled,
  ollamaBaseUrl,
  ollamaModel,
  extractJsonPayload,
  generateJson,
};
