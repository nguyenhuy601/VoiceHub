/**
 * LLM runtime — Embeddings for RAG RAG.
 * - LLM_PROVIDER=ollama → Ollama /api/embeddings|/api/embed
 * - LLM_PROVIDER=dashscope|openai_compatible → DashScope OpenAI-compatible /embeddings
 */

const axios = require('axios');
const {
  isOpenAiCompatibleProvider,
  embeddingsCreate,
  embeddingsCreateBatch,
  EMBED_BATCH_LIMIT,
  remoteEmbedModel,
  DEFAULT_REMOTE_EMBED_MODEL,
} = require('@enterprise/shared/llm/openaiCompatibleClient');

const DEFAULT_EMBED_MODEL = 'qwen3-embedding:0.6b';
const DEFAULT_EMBED_VERSION = 'ollama-qwen3-emb-0.6b';
const DEFAULT_REMOTE_EMBED_VERSION = 'dashscope-text-embedding-v4';

function embedModel(env = process.env) {
  if (isOpenAiCompatibleProvider(env)) {
    return remoteEmbedModel(env, DEFAULT_REMOTE_EMBED_MODEL);
  }
  return (
    String(env.RAG_EMBEDDING_MODEL || env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL).trim() ||
    DEFAULT_EMBED_MODEL
  );
}

function embedVersion(env = process.env) {
  if (isOpenAiCompatibleProvider(env)) {
    const v = String(env.RAG_EMBEDDING_VERSION || '').trim();
    // Ignore leftover Ollama version strings when on DashScope.
    if (v && !v.startsWith('ollama-')) {
      return v;
    }
    return DEFAULT_REMOTE_EMBED_VERSION;
  }
  return (
    String(env.RAG_EMBEDDING_VERSION || DEFAULT_EMBED_VERSION).trim() || DEFAULT_EMBED_VERSION
  );
}

function ollamaBaseUrl(env = process.env) {
  return String(env.OLLAMA_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * @param {{ text: string, env?: NodeJS.ProcessEnv, axiosImpl?: object }} opts
 * @returns {Promise<{ ok: boolean, embedding: number[], model: string, embeddingVersion: string, error?: string }>}
 */
async function embedText(opts = {}) {
  const env = opts.env || process.env;
  const model = embedModel(env);
  const version = embedVersion(env);
  const text = String(opts.text || '').trim();
  const http = opts.axiosImpl || axios;

  if (!text) {
    return {
      ok: false,
      embedding: [],
      model,
      embeddingVersion: version,
      error: 'empty_text',
    };
  }

  if (isOpenAiCompatibleProvider(env)) {
    const remote = await embeddingsCreate({
      text,
      model,
      env,
      axiosImpl: http,
    });
    return {
      ok: Boolean(remote.ok),
      embedding: Array.isArray(remote.embedding) ? remote.embedding : [],
      model: remote.model || model,
      embeddingVersion: version,
      error: remote.error,
    };
  }

  const baseUrl = ollamaBaseUrl(env);
  if (!baseUrl) {
    return {
      ok: false,
      embedding: [],
      model,
      embeddingVersion: version,
      error: 'OLLAMA_BASE_URL_missing',
    };
  }

  const timeout = Number(env.RAG_EMBED_TIMEOUT_MS || 60000);
  const httpOpts = { timeout, validateStatus: () => true };

  try {
    const legacy = await http.post(
      `${baseUrl}/api/embeddings`,
      { model, prompt: text },
      httpOpts
    );
    const legacyVector = legacy.data?.embedding;
    if (
      legacy.status >= 200 &&
      legacy.status < 300 &&
      Array.isArray(legacyVector) &&
      legacyVector.length
    ) {
      return { ok: true, embedding: legacyVector, model, embeddingVersion: version };
    }

    const modern = await http.post(
      `${baseUrl}/api/embed`,
      { model, input: text },
      httpOpts
    );
    const modernVector = modern.data?.embeddings?.[0];
    if (
      modern.status >= 200 &&
      modern.status < 300 &&
      Array.isArray(modernVector) &&
      modernVector.length
    ) {
      return { ok: true, embedding: modernVector, model, embeddingVersion: version };
    }

    const status = modern.status || legacy.status;
    return {
      ok: false,
      embedding: [],
      model,
      embeddingVersion: version,
      error: `embed_http_${status}`,
    };
  } catch (error) {
    return {
      ok: false,
      embedding: [],
      model,
      embeddingVersion: version,
      error: error?.message || 'embed_failed',
    };
  }
}

/**
 * Embed many documents. Remote provider sends at most 10 texts per HTTP call.
 * Ollama stays one text per call inside this function.
 * @param {{ texts?: string[], env?: NodeJS.ProcessEnv, axiosImpl?: object }} opts
 */
async function embedTexts(opts = {}) {
  const env = opts.env || process.env;
  const texts = Array.isArray(opts.texts) ? opts.texts : [];
  const model = embedModel(env);
  const version = embedVersion(env);
  if (!texts.length) {
    return {
      ok: true,
      embeddings: [],
      model,
      embeddingVersion: version,
      retries: 0,
      requestCount: 0,
      batchSize: EMBED_BATCH_LIMIT,
    };
  }

  if (isOpenAiCompatibleProvider(env)) {
    const remote = await embeddingsCreateBatch({
      texts,
      model,
      env,
      axiosImpl: opts.axiosImpl,
    });
    return {
      ok: Boolean(remote.ok),
      embeddings: Array.isArray(remote.embeddings) ? remote.embeddings : [],
      model: remote.model || model,
      embeddingVersion: version,
      error: remote.error,
      retries: Number(remote.retries) || 0,
      requestCount: Number(remote.requestCount) || 0,
      batchSize: EMBED_BATCH_LIMIT,
    };
  }

  const embeddings = [];
  for (const text of texts) {
    const one = await embedText({ text, env, axiosImpl: opts.axiosImpl });
    if (!one.ok || !one.embedding?.length) {
      return {
        ok: false,
        embeddings: [],
        model,
        embeddingVersion: version,
        error: one.error || 'embed_failed',
        retries: 0,
        requestCount: embeddings.length + 1,
        batchSize: 1,
      };
    }
    embeddings.push(one.embedding);
  }
  return {
    ok: true,
    embeddings,
    model,
    embeddingVersion: version,
    retries: 0,
    requestCount: texts.length,
    batchSize: 1,
  };
}

module.exports = {
  embedText,
  embedTexts,
  embedModel,
  embedVersion,
  DEFAULT_EMBED_MODEL,
  DEFAULT_EMBED_VERSION,
  DEFAULT_REMOTE_EMBED_VERSION,
  EMBED_BATCH_LIMIT,
};
