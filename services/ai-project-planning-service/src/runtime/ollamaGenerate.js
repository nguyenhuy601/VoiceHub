/**
 * G17 — LLM generate wrapper (JSON extract + usage meta).
 * Providers: ollama (/api/generate) | openai_compatible (DashScope chat.completions).
 */

const http = require('http');
const https = require('https');
const axios = require('axios');
const {
  isOpenAiCompatibleProvider,
  chatCompletionsText,
  chatModel: sharedChatModel,
} = require('@enterprise/shared/llm/openaiCompatibleClient');

const DEFAULT_MODEL = 'qwen2.5:3b-instruct';
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_NUM_PREDICT = 512;
const DEFAULT_KEEP_ALIVE = '30m';

/** Connection reuse for repeated Ollama calls (External service + HTTP keep-alive). */
const ollamaHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 4 });
const ollamaHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const ollamaAxios = axios.create({
  httpAgent: ollamaHttpAgent,
  httpsAgent: ollamaHttpsAgent,
  validateStatus: () => true,
});

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
  if (isOpenAiCompatibleProvider(env)) {
    return sharedChatModel(env, 'qwen3.8-max');
  }
  return String(env.OLLAMA_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function ollamaKeepAlive(env = process.env) {
  const raw = String(env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE).trim();
  return raw || DEFAULT_KEEP_ALIVE;
}

function tryParseJson(slice) {
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/** Best-effort close truncated JSON from small models (num_predict cut mid-object). */
function repairTruncatedJson(slice) {
  let s = String(slice || '').trim();
  if (!s) return null;
  const direct = tryParseJson(s);
  if (direct != null) return direct;

  // Prefer last complete object inside an array (common truncated shape).
  const arrKey = s.match(/^\s*\{\s*"([^"]+)"\s*:\s*\[/u);
  if (arrKey) {
    const key = arrKey[1];
    const objs = [];
    const re = /\{[^{}]*\}/gu;
    let m;
    while ((m = re.exec(s)) != null) {
      const one = tryParseJson(m[0]);
      if (one && typeof one === 'object') objs.push(one);
    }
    if (objs.length) return { [key]: objs };
  }

  // Generic: close open strings/brackets from the truncated end.
  for (let trim = 0; trim < 80 && s.length > 2; trim += 1) {
    let candidate = s.slice(0, s.length - trim).replace(/,\s*$/u, '');
    let inStr = false;
    let esc = false;
    const stack = [];
    for (let i = 0; i < candidate.length; i += 1) {
      const ch = candidate[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }
    if (inStr) candidate += '"';
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      candidate += stack[i] === '{' ? '}' : ']';
    }
    const parsed = tryParseJson(candidate);
    if (parsed != null) return parsed;
  }
  return null;
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
  const primary = end > start ? raw.slice(start, end + 1) : raw.slice(start);
  const parsed = tryParseJson(primary);
  if (parsed != null) return parsed;
  // Truncated completion: repair from start to end of text
  return repairTruncatedJson(raw.slice(start));
}

async function generateJsonViaOpenAi(opts, env, model, http) {
  const timeout =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs))
      ? Math.max(5000, Math.min(600000, Number(opts.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
  const predict =
    opts.numPredict != null && Number.isFinite(Number(opts.numPredict))
      ? Math.max(32, Math.min(2048, Math.round(Number(opts.numPredict))))
      : DEFAULT_NUM_PREDICT;

  const chat = await chatCompletionsText({
    prompt: String(opts.prompt || ''),
    temperature: opts.temperature != null ? Number(opts.temperature) : 0.1,
    timeoutMs: timeout,
    maxTokens: predict,
    model,
    env,
    axiosImpl: http,
  });

  const usage = {
    promptEvalCount: Number(chat.usage?.promptTokens) || 0,
    evalCount: Number(chat.usage?.completionTokens) || 0,
  };

  if (!chat.ok) {
    return {
      ok: false,
      model,
      data: null,
      error: chat.error || 'openai_error',
      usage,
    };
  }

  const data = extractJsonPayload(chat.text);
  if (data == null) {
    return { ok: false, model, data: null, error: 'ollama_json_parse', usage };
  }
  return { ok: true, model, data, usage };
}

function buildUsageFromOllama(body) {
  const totalNs = Number(body?.total_duration) || 0;
  const loadNs = Number(body?.load_duration) || 0;
  const promptNs = Number(body?.prompt_eval_duration) || 0;
  const evalNs = Number(body?.eval_duration) || 0;
  return {
    promptEvalCount: Number(body?.prompt_eval_count) || 0,
    evalCount: Number(body?.eval_count) || 0,
    totalDurationMs: totalNs ? Math.round(totalNs / 1e6) : 0,
    loadDurationMs: loadNs ? Math.round(loadNs / 1e6) : 0,
    promptEvalDurationMs: promptNs ? Math.round(promptNs / 1e6) : 0,
    evalDurationMs: evalNs ? Math.round(evalNs / 1e6) : 0,
  };
}

/**
 * @param {{ prompt: string, temperature?: number, timeoutMs?: number, numPredict?: number, numCtx?: number, env?: NodeJS.ProcessEnv, axiosImpl?: object }} opts
 */
async function generateJson(opts = {}) {
  const env = opts.env || process.env;
  const model = ollamaModel(env);
  const httpClient = opts.axiosImpl || ollamaAxios;

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

  if (isOpenAiCompatibleProvider(env)) {
    return generateJsonViaOpenAi(opts, env, model, opts.axiosImpl || axios);
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
  } else {
    const envCtx = Number(env.OLLAMA_NUM_CTX);
    if (Number.isFinite(envCtx) && envCtx >= 512) {
      options.num_ctx = Math.min(32768, Math.round(envCtx));
    }
  }

  try {
    const res = await httpClient.post(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt: String(opts.prompt || ''),
        stream: false,
        format: 'json',
        keep_alive: ollamaKeepAlive(env),
        options,
      },
      { timeout }
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
    const usage = buildUsageFromOllama(res.data);
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
  buildUsageFromOllama,
  generateJson,
};
