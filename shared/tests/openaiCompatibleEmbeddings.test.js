'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  remoteEmbedModel,
  remoteEmbedDimensions,
  embeddingsCreate,
  isOpenAiCompatibleProvider,
} = require('../llm/openaiCompatibleClient');

describe('remoteEmbedModel', () => {
  it('defaults to text-embedding-v4 for DashScope', () => {
    assert.equal(
      remoteEmbedModel({ LLM_PROVIDER: 'openai_compatible' }),
      'text-embedding-v4'
    );
  });

  it('ignores leftover Ollama model tags', () => {
    assert.equal(
      remoteEmbedModel({
        LLM_PROVIDER: 'dashscope',
        G7_EMBEDDING_MODEL: 'qwen3-embedding:0.6b',
      }),
      'text-embedding-v4'
    );
  });

  it('honors explicit DashScope model name', () => {
    assert.equal(
      remoteEmbedModel({
        LLM_PROVIDER: 'dashscope',
        G7_EMBEDDING_MODEL: 'text-embedding-v3',
      }),
      'text-embedding-v3'
    );
  });
});

describe('remoteEmbedDimensions', () => {
  it('defaults to 1024', () => {
    assert.equal(remoteEmbedDimensions({}), 1024);
  });

  it('reads G7_EMBED_DIMENSIONS', () => {
    assert.equal(remoteEmbedDimensions({ G7_EMBED_DIMENSIONS: '768' }), 768);
  });
});

describe('embeddingsCreate', () => {
  it('POSTs OpenAI-compatible /embeddings', async () => {
    const calls = [];
    const axiosImpl = {
      async post(url, body, opts) {
        calls.push({ url, body, opts });
        return {
          status: 200,
          data: { data: [{ embedding: [0.1, 0.2, 0.3] }] },
        };
      },
    };
    const res = await embeddingsCreate({
      text: 'hello',
      env: {
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_BASE_URL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        DASHSCOPE_API_KEY: 'test-key',
        G7_EMBEDDING_MODEL: 'text-embedding-v4',
      },
      axiosImpl,
      sleepImpl: async () => {},
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.embedding, [0.1, 0.2, 0.3]);
    assert.equal(res.model, 'text-embedding-v4');
    assert.equal(
      calls[0].url,
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings'
    );
    assert.equal(calls[0].body.model, 'text-embedding-v4');
    assert.equal(calls[0].body.encoding_format, 'float');
    assert.equal(calls[0].body.dimensions, 1024);
    assert.match(calls[0].opts.headers.Authorization, /^Bearer test-key$/);
  });

  it('fails closed without API key', async () => {
    const res = await embeddingsCreate({
      text: 'hello',
      env: {
        OPENAI_BASE_URL: 'https://example.com/v1',
      },
      axiosImpl: { post: async () => ({ status: 200, data: {} }) },
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'DASHSCOPE_API_KEY_missing');
  });
});

describe('isOpenAiCompatibleProvider', () => {
  it('recognizes openai_compatible and dashscope', () => {
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'openai_compatible' }), true);
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'dashscope' }), true);
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'ollama' }), false);
  });
});
