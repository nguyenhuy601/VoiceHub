/**
 * Shared Ollama generate helper for planning (longer timeout than rewriteExperience).
 */

const axios = require('axios');
const { logger } = require('@enterprise/shared');

const DEFAULT_MODEL = 'qwen2.5:3b-instruct';
const DEFAULT_TIMEOUT_MS = 240000;
const DEFAULT_ENRICH_TIMEOUT_MS = 120000;
const DEFAULT_ASSIGN_TIMEOUT_MS = 60000;
const DEFAULT_ANALYSIS_CHUNK_TIMEOUT_MS = 180000;
const MAX_PLANNING_TIMEOUT_MS = 600000;
const DEFAULT_NUM_PREDICT = 512;
const DEFAULT_KEEP_ALIVE = '30m';
const WARM_NUM_PREDICT = 8;

function llmProvider() {
  return String(process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
}

function isAiPlanningLlmEnabled() {
  const flag = String(process.env.AI_PLANNING_LLM ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  return true;
}

function isOllamaWarmupEnabled() {
  const flag = String(process.env.OLLAMA_WARMUP ?? '1').trim().toLowerCase();
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

function ollamaKeepAlive() {
  const raw = String(process.env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE).trim();
  return raw || DEFAULT_KEEP_ALIVE;
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

function assignTimeoutMs() {
  return clampTimeoutMs(process.env.OLLAMA_PLANNING_ASSIGN_TIMEOUT_MS, DEFAULT_ASSIGN_TIMEOUT_MS);
}

/** Per-chunk timeout for AI Analysis runners (default 180s; was hard-capped at 60s). */
function analysisChunkTimeoutMs() {
  return clampTimeoutMs(
    process.env.OLLAMA_ANALYSIS_CHUNK_TIMEOUT_MS,
    DEFAULT_ANALYSIS_CHUNK_TIMEOUT_MS
  );
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
        keep_alive: ollamaKeepAlive(),
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

/**
 * Load model into Ollama memory before analysis chunks (cold start ~70s+ on small hosts).
 * Failures are non-fatal — callers continue with heuristic fallback paths.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string, elapsedMs?: number }>}
 */
async function warmOllamaModel() {
  const model = ollamaModel();
  if (!isOllamaWarmupEnabled()) {
    return { ok: false, skipped: true, error: 'warmup_disabled' };
  }
  if (!isAiPlanningLlmEnabled() || llmProvider() === 'mock') {
    return { ok: false, skipped: true, error: 'llm_skipped' };
  }
  const baseUrl = ollamaBaseUrl();
  if (!baseUrl) {
    return { ok: false, skipped: true, error: 'ollama_base_url_missing' };
  }

  const timeout = analysisChunkTimeoutMs();
  const started = Date.now();
  try {
    const res = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt: '{"ping":1}',
        stream: false,
        keep_alive: ollamaKeepAlive(),
        options: {
          temperature: 0,
          num_predict: WARM_NUM_PREDICT,
        },
      },
      { timeout, validateStatus: () => true }
    );
    const elapsedMs = Date.now() - started;
    if (!res || res.status < 200 || res.status >= 300) {
      const error = `ollama_http_${res?.status || 0}`;
      logger.warn('[ollama] warm failed model=%s error=%s elapsedMs=%s', model, error, elapsedMs);
      return { ok: false, error, elapsedMs };
    }
    logger.info('[ollama] warm ok model=%s elapsedMs=%s', model, elapsedMs);
    return { ok: true, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const error = err.code === 'ECONNABORTED' ? 'ollama_timeout' : 'ollama_error';
    logger.warn('[ollama] warm failed model=%s error=%s elapsedMs=%s', model, error, elapsedMs);
    return { ok: false, error, elapsedMs };
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_ENRICH_TIMEOUT_MS,
  DEFAULT_ASSIGN_TIMEOUT_MS,
  DEFAULT_ANALYSIS_CHUNK_TIMEOUT_MS,
  MAX_PLANNING_TIMEOUT_MS,
  DEFAULT_NUM_PREDICT,
  DEFAULT_KEEP_ALIVE,
  llmProvider,
  isAiPlanningLlmEnabled,
  isOllamaWarmupEnabled,
  ollamaBaseUrl,
  ollamaModel,
  ollamaKeepAlive,
  planningTimeoutMs,
  enrichTimeoutMs,
  assignTimeoutMs,
  analysisChunkTimeoutMs,
  extractJsonPayload,
  generateJson,
  warmOllamaModel,
};
