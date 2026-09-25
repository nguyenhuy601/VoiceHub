/**
 * G17 — Ollama /api/embeddings wrapper.
 */

const axios = require('axios');

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_EMBED_VERSION = 'ollama-nomic-v1';

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

  try {
    const res = await http.post(
      `${baseUrl}/api/embeddings`,
      { model, prompt: text },
      { timeout: Number(env.G7_EMBED_TIMEOUT_MS || 60000), validateStatus: () => true }
    );
    const embedding = res.data?.embedding;
    if (res.status >= 200 && res.status < 300 && Array.isArray(embedding) && embedding.length) {
      return { ok: true, embedding, model, embeddingVersion: version };
    }
    return {
      ok: false,
      embedding: [],
      model,
      embeddingVersion: version,
      error: `embed_http_${res.status}`,
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
