/**
 * OpenAI-compatible Chat Completions (DashScope MaaS / compatible-mode/v1).
 * Chat only — G7 embed stays on Ollama in this phase.
 */

const axios = require('axios');

const REMOTE_PROVIDERS = new Set([
  'openai_compatible',
  'openai-compatible', // alias UI/docs hyphen
  'openai',
  'dashscope',
]);

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
  return String(env.OLLAMA_MODEL || env.LLM_CHAT_MODEL || fallback).trim() || fallback;
}

/**
 * Non-stream chat.completions — returns assistant text (no enable_thinking).
 * @param {{
 *   prompt: string,
 *   temperature?: number,
 *   timeoutMs?: number,
 *   maxTokens?: number,
 *   model?: string,
 *   env?: NodeJS.ProcessEnv,
 *   axiosImpl?: object,
 * }} opts
 * @returns {Promise<{ ok: boolean, text: string, model: string, error?: string, usage?: object }>}
 */
async function chatCompletionsText(opts = {}) {
  const env = opts.env || process.env;
  const model = String(opts.model || chatModel(env)).trim();
  const http = opts.axiosImpl || axios;
  const baseUrl = openAiBaseUrl(env);
  const apiKey = openAiApiKey(env);
  const prompt = String(opts.prompt || '');

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
      return {
        ok: false,
        text: '',
        model,
        error: `openai_http_${res?.status || 0}`,
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }

    const choice = res.data?.choices?.[0];
    const text = String(choice?.message?.content || '').trim();
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
    return {
      ok: false,
      text: '',
      model,
      error: code,
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }
}

module.exports = {
  REMOTE_PROVIDERS,
  llmProvider,
  isOpenAiCompatibleProvider,
  openAiBaseUrl,
  openAiApiKey,
  chatModel,
  chatCompletionsText,
};
