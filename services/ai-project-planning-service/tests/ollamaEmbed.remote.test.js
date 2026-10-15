'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  embedModel,
  embedVersion,
  embedText,
  DEFAULT_REMOTE_EMBED_VERSION,
} = require('../src/runtime/ollamaEmbed');

describe('ollamaEmbed remote (DashScope)', () => {
  it('selects DashScope model/version when LLM_PROVIDER is openai_compatible', () => {
    const env = {
      LLM_PROVIDER: 'openai_compatible',
      G7_EMBEDDING_MODEL: 'qwen3-embedding:0.6b',
      G7_EMBEDDING_VERSION: 'ollama-qwen3-emb-0.6b',
    };
    assert.equal(embedModel(env), 'text-embedding-v4');
    assert.equal(embedVersion(env), DEFAULT_REMOTE_EMBED_VERSION);
  });

  it('routes embedText to OpenAI-compatible embeddings', async () => {
    const axiosImpl = {
      async post(url) {
        assert.match(url, /\/embeddings$/);
        return {
          status: 200,
          data: { data: [{ embedding: [1, 2, 3, 4] }] },
        };
      },
    };
    const res = await embedText({
      text: 'fr-1 login',
      env: {
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_BASE_URL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        DASHSCOPE_API_KEY: 'test-key',
      },
      axiosImpl,
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.embedding, [1, 2, 3, 4]);
    assert.equal(res.model, 'text-embedding-v4');
    assert.equal(res.embeddingVersion, DEFAULT_REMOTE_EMBED_VERSION);
  });

  it('keeps Ollama path when LLM_PROVIDER=ollama', async () => {
    const axiosImpl = {
      async post(url, body) {
        assert.match(url, /\/api\/embeddings$/);
        assert.equal(body.model, 'qwen3-embedding:0.6b');
        return { status: 200, data: { embedding: [9, 8] } };
      },
    };
    const res = await embedText({
      text: 'local',
      env: {
        LLM_PROVIDER: 'ollama',
        OLLAMA_BASE_URL: 'http://ollama:11434',
      },
      axiosImpl,
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.embedding, [9, 8]);
    assert.equal(res.embeddingVersion, 'ollama-qwen3-emb-0.6b');
  });
});
