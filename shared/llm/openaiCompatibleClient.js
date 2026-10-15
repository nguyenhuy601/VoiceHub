/**
 * OpenAI-compatible Chat Completions + Embeddings (DashScope MaaS / compatible-mode/v1).
 * G7 RAG embed uses embeddingsCreate when LLM_PROVIDER is dashscope / openai_compatible.
 */

const axios = require('axios');
const { maskPromptPrivacy, unmaskPromptPrivacy } = require('./promptPrivacy');

const REMOTE_PROVIDERS = new Set([
  'openai_compatible',
  'openai-compatible', // alias UI/docs hyphen
  'openai',
  'dashscope',
]);

const MAX_TRANSIENT_RETRIES = 2;
const RETRY_DELAY_MS = 800;

function llmProvider(env = process.env) {
  return String(env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
}

function isOpenAiCompatibleProvider(env = process.env) {
  return REMOTE_PROVIDERS.has(llmProvider(env));
}

function openAiBaseUrl(env = process.env) {
  return String(env.OPENAI_BASE_URL || env.DASHSCOPE_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function openAiApiKey(env = process.env) {
  return String(env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY || '').trim();
}

function chatModel(env = process.env, fallback = 'qwen3.8-max') {
  if (isOpenAiCompatibleProvider(env)) {
    return String(env.LLM_CHAT_MODEL || '').trim();
  }
  return String(env.OLLAMA_MODEL || fallback).trim() || fallback;
}

/** Free-quota DashScope text embed (OpenAI-compatible). Override via G7_EMBEDDING_MODEL. */
const DEFAULT_REMOTE_EMBED_MODEL = 'text-embedding-v4';

function remoteEmbedModel(env = process.env, fallback = DEFAULT_REMOTE_EMBED_MODEL) {
  const raw = String(env.G7_EMBEDDING_MODEL || env.LLM_EMBED_MODEL || '').trim();
  // Ignore leftover Ollama tags (e.g. qwen3-embedding:0.6b) when on DashScope.
  if (raw && !raw.includes(':')) {
    return raw;
  }
  return String(fallback).trim() || DEFAULT_REMOTE_EMBED_MODEL;
}

function remoteEmbedDimensions(env = process.env) {
  const n = Number(env.G7_EMBED_DIMENSIONS);
  if (Number.isFinite(n) && n >= 64 && n <= 2560) {
    return Math.round(n);
  }
  return 1024;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableHttpStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Non-stream chat.completions — returns assistant text (no enable_thinking).
 * Masks email/phone before remote POST; unmasks content after success.
 * Retries up to 2 times on 429 / timeout / 502–504.
 * @param {{
 *   prompt: string,
 *   temperature?: number,
 *   timeoutMs?: number,
 *   maxTokens?: number,
 *   model?: string,
 *   env?: NodeJS.ProcessEnv,
 *   axiosImpl?: object,
 *   sleepImpl?: (ms: number) => Promise<void>,
 * }} opts
 * @returns {Promise<{ ok: boolean, text: string, model: string, error?: string, usage?: object }>}
 */
async function chatCompletionsText(opts = {}) {
  const env = opts.env || process.env;
  const remote = isOpenAiCompatibleProvider(env);
  const model = remote
    ? String(env.LLM_CHAT_MODEL || '').trim()
    : String(opts.model || chatModel(env)).trim();
  if (remote && !model) {
    return { ok: false, text: '', model: '', error: 'LLM_CHAT_MODEL_missing' };
  }
  const http = opts.axiosImpl || axios;
  const wait = opts.sleepImpl || sleep;
  const baseUrl = openAiBaseUrl(env);
  const apiKey = openAiApiKey(env);
  const promptRaw = String(opts.prompt || '');
  const { text: prompt, tokens } = remote
    ? maskPromptPrivacy(promptRaw)
    : { text: promptRaw, tokens: new Map() };

  if (!baseUrl) {
    return { ok: false, text: '', model, error: 'OPENAI_BASE_URL_missing' };
  }
  if (!apiKey) {
    return { ok: false, text: '', model, error: 'DASHSCOPE_API_KEY_missing' };
  }

  const timeout =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs))
      ? Math.max(5000, Math.min(600000, Number(opts.timeoutMs)))
      : 180000;
  const maxTokens =
    opts.maxTokens != null && Number.isFinite(Number(opts.maxTokens))
      ? Math.max(32, Math.min(8192, Math.round(Number(opts.maxTokens))))
      : 512;
  const temperature =
    opts.temperature != null && Number.isFinite(Number(opts.temperature))
      ? Number(opts.temperature)
      : 0.1;

  let lastError = 'openai_error';
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    try {
      const res = await http.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          temperature,
          max_tokens: maxTokens,
        },
        {
          timeout,
          validateStatus: () => true,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res || res.status < 200 || res.status >= 300) {
        const status = res?.status || 0;
        lastError = `openai_http_${status}`;
        if (isRetryableHttpStatus(status) && attempt < MAX_TRANSIENT_RETRIES) {
          await wait(RETRY_DELAY_MS);
          continue;
        }
        return {
          ok: false,
          text: '',
          model,
          error: lastError,
          usage: { promptTokens: 0, completionTokens: 0 },
        };
      }

      const choice = res.data?.choices?.[0];
      const rawText = String(choice?.message?.content || '').trim();
      const text = unmaskPromptPrivacy(rawText, tokens);
      const usage = {
        promptTokens: Number(res.data?.usage?.prompt_tokens) || 0,
        completionTokens: Number(res.data?.usage?.completion_tokens) || 0,
      };

      if (!text) {
        return { ok: false, text: '', model, error: 'openai_empty_content', usage };
      }

      return { ok: true, text, model, usage };
    } catch (err) {
      const code = err.code === 'ECONNABORTED' ? 'openai_timeout' : 'openai_error';
      lastError = code;
      if (code === 'openai_timeout' && attempt < MAX_TRANSIENT_RETRIES) {
        await wait(RETRY_DELAY_MS);
        continue;
      }
      return {
        ok: false,
        text: '',
        model,
        error: code,
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }
  }

  return {
    ok: false,
    text: '',
    model,
    error: lastError,
    usage: { promptTokens: 0, completionTokens: 0 },
  };
}

/**
 * OpenAI-compatible embeddings.create — DashScope text-embedding-v3/v4 (free quota).
 * @param {{
 *   text: string,
 *   model?: string,
 *   dimensions?: number,
 *   timeoutMs?: number,
 *   env?: NodeJS.ProcessEnv,
 *   axiosImpl?: object,
 *   sleepImpl?: (ms: number) => Promise<void>,
 * }} opts
 * @returns {Promise<{ ok: boolean, embedding: number[], model: string, error?: string }>}
 */
async function embeddingsCreate(opts = {}) {
  const env = opts.env || process.env;
  const model = String(opts.model || remoteEmbedModel(env)).trim() || DEFAULT_REMOTE_EMBED_MODEL;
  const http = opts.axiosImpl || axios;
  const wait = opts.sleepImpl || sleep;
  const baseUrl = openAiBaseUrl(env);
  const apiKey = openAiApiKey(env);
  const text = String(opts.text || '').trim();

  if (!text) {
    return { ok: false, embedding: [], model, error: 'empty_text' };
  }
  if (!baseUrl) {
    return { ok: false, embedding: [], model, error: 'OPENAI_BASE_URL_missing' };
  }
  if (!apiKey) {
    return { ok: false, embedding: [], model, error: 'DASHSCOPE_API_KEY_missing' };
  }

  const timeout =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs))
      ? Math.max(5000, Math.min(120000, Number(opts.timeoutMs)))
      : Number(env.G7_EMBED_TIMEOUT_MS) > 0
        ? Math.max(5000, Math.min(120000, Number(env.G7_EMBED_TIMEOUT_MS)))
        : 60000;

  const dimensions =
    opts.dimensions != null && Number.isFinite(Number(opts.dimensions))
      ? Math.round(Number(opts.dimensions))
      : remoteEmbedDimensions(env);

  const body = {
    model,
    input: text,
    encoding_format: 'float',
  };
  if (dimensions) {
    body.dimensions = dimensions;
  }

  let lastError = 'openai_embed_error';
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    try {
      const res = await http.post(`${baseUrl}/embeddings`, body, {
        timeout,
        validateStatus: () => true,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res || res.status < 200 || res.status >= 300) {
        const status = res?.status || 0;
        lastError = `openai_embed_http_${status}`;
        if (isRetryableHttpStatus(status) && attempt < MAX_TRANSIENT_RETRIES) {
          await wait(RETRY_DELAY_MS);
          continue;
        }
        return { ok: false, embedding: [], model, error: lastError };
      }

      const vector = res.data?.data?.[0]?.embedding;
      if (!Array.isArray(vector) || !vector.length) {
        return { ok: false, embedding: [], model, error: 'openai_embed_empty' };
      }
      return { ok: true, embedding: vector, model };
    } catch (err) {
      const code = err.code === 'ECONNABORTED' ? 'openai_embed_timeout' : 'openai_embed_error';
      lastError = code;
      if (code === 'openai_embed_timeout' && attempt < MAX_TRANSIENT_RETRIES) {
        await wait(RETRY_DELAY_MS);
        continue;
      }
      return { ok: false, embedding: [], model, error: lastError };
    }
  }

  return { ok: false, embedding: [], model, error: lastError };
}

module.exports = {
  REMOTE_PROVIDERS,
  DEFAULT_REMOTE_EMBED_MODEL,
  llmProvider,
  isOpenAiCompatibleProvider,
  openAiBaseUrl,
  openAiApiKey,
  chatModel,
  remoteEmbedModel,
  remoteEmbedDimensions,
  chatCompletionsText,
  embeddingsCreate,
};
