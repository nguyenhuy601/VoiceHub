/**
 * G17 — Ollama /api/embeddings wrapper.
 */

const axios = require('axios');

const DEFAULT_EMBED_MODEL = 'qwen3-embedding:0.6b';
const DEFAULT_EMBED_VERSION = 'ollama-qwen3-emb-0.6b';

function embedModel(env = process.env) {
  return (
    String(env.G7_EMBEDDING_MODEL || env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL).trim() ||
    DEFAULT_EMBED_MODEL
  );
}

function embedVersion(env = process.env) {
  return (
    String(env.G7_EMBEDDING_VERSION || DEFAULT_EMBED_VERSION).trim() || DEFAULT_EMBED_VERSION
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

  const timeout = Number(env.G7_EMBED_TIMEOUT_MS || 60000);
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

module.exports = {
  embedText,
  embedModel,
  embedVersion,
  DEFAULT_EMBED_MODEL,
  DEFAULT_EMBED_VERSION,
};
