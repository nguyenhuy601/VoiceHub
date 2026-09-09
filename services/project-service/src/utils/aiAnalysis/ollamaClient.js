/**
 * Shared Ollama generate helper for planning (longer timeout than rewriteExperience).
 */

const axios = require('axios');

const DEFAULT_MODEL = 'qwen2.5:3b-instruct';
const DEFAULT_TIMEOUT_MS = 240000;
const DEFAULT_ENRICH_TIMEOUT_MS = 120000;
const MAX_PLANNING_TIMEOUT_MS = 600000;
const DEFAULT_NUM_PREDICT = 512;

function llmProvider() {
  return String(process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
}

function isAiPlanningLlmEnabled() {
  const flag = String(process.env.AI_PLANNING_LLM ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  return true;
}

function ollamaBaseUrl() {
  return String(process.env.OLLAMA_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function ollamaModel() {
  return String(process.env.OLLAMA_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function clampTimeoutMs(raw, fallback) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 5000) return Math.min(n, MAX_PLANNING_TIMEOUT_MS);
  return fallback;
}

function planningTimeoutMs() {
  return clampTimeoutMs(process.env.OLLAMA_PLANNING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function enrichTimeoutMs() {
  return clampTimeoutMs(process.env.OLLAMA_PLANNING_ENRICH_TIMEOUT_MS, DEFAULT_ENRICH_TIMEOUT_MS);
}

/**
 * Extract first JSON object or array from model text.
 * @param {string} text
 * @returns {unknown|null}
 */
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
 * Call Ollama /api/generate and parse JSON from response.
 * @param {{ prompt: string, temperature?: number, timeoutMs?: number, numPredict?: number }} opts
 * @returns {Promise<{ ok: boolean, model: string, data: unknown|null, error?: string, skipped?: boolean }>}
 */
async function generateJson({ prompt, temperature = 0.1, timeoutMs, numPredict } = {}) {
  const model = ollamaModel();
  if (!isAiPlanningLlmEnabled() || llmProvider() === 'mock') {
    return { ok: false, model, data: null, skipped: true, error: 'llm_skipped' };
  }
  const baseUrl = ollamaBaseUrl();
  if (!baseUrl) {
    return { ok: false, model, data: null, skipped: true, error: 'ollama_base_url_missing' };
  }

  const timeout = timeoutMs != null ? clampTimeoutMs(timeoutMs, DEFAULT_TIMEOUT_MS) : planningTimeoutMs();
  const predict =
    numPredict != null && Number.isFinite(Number(numPredict))
      ? Math.max(32, Math.min(2048, Math.round(Number(numPredict))))
      : DEFAULT_NUM_PREDICT;

  try {
    const res = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt: String(prompt || ''),
        stream: false,
        options: {
          temperature,
          num_predict: predict,
        },
      },
      { timeout, validateStatus: () => true }
    );
    if (!res || res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        model,
        data: null,
        error: `ollama_http_${res?.status || 0}`,
      };
    }
    const text = String(res.data?.response || '');
    const data = extractJsonPayload(text);
    if (data == null) {
      return { ok: false, model, data: null, error: 'ollama_json_parse' };
    }
    return { ok: true, model, data };
  } catch (err) {
    const code = err.code === 'ECONNABORTED' ? 'ollama_timeout' : 'ollama_error';
    return { ok: false, model, data: null, error: code };
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_ENRICH_TIMEOUT_MS,
  MAX_PLANNING_TIMEOUT_MS,
  DEFAULT_NUM_PREDICT,
  llmProvider,
  isAiPlanningLlmEnabled,
  ollamaBaseUrl,
  ollamaModel,
  planningTimeoutMs,
  enrichTimeoutMs,
  extractJsonPayload,
  generateJson,
};
