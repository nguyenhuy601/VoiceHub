/**
 * Unit — OpenAI-compatible chat client (mock axios).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isOpenAiCompatibleProvider,
  chatCompletionsText,
} = require('../llm/openaiCompatibleClient');

describe('openaiCompatibleClient', () => {
  it('detects openai_compatible / dashscope / openai', () => {
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'openai_compatible' }), true);
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'openai-compatible' }), true);
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'dashscope' }), true);
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'openai' }), true);
    assert.equal(isOpenAiCompatibleProvider({ LLM_PROVIDER: 'ollama' }), false);
  });

  it('T1: chat mock 200 → text', async () => {
    const axiosImpl = {
      async post(url, body, cfg) {
        assert.match(String(url), /\/chat\/completions$/);
        assert.equal(body.stream, false);
        assert.equal(body.messages[0].role, 'user');
        assert.match(String(cfg.headers.Authorization || ''), /^Bearer sk-test/);
        return {
          status: 200,
          data: {
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 3, completion_tokens: 5 },
          },
        };
      },
    };

    const result = await chatCompletionsText({
      prompt: 'return json',
      env: {
        OPENAI_BASE_URL: 'https://example.com/compatible-mode/v1',
        DASHSCOPE_API_KEY: 'sk-test',
        OLLAMA_MODEL: 'qwen3.8-max',
      },
      axiosImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(result.text, '{"ok":true}');
    assert.equal(result.model, 'qwen3.8-max');
    assert.equal(result.usage.completionTokens, 5);
  });

  it('cloud model ignores local OLLAMA_MODEL', async () => {
    const axiosImpl = {
      async post(_url, body) {
        assert.equal(body.model, 'qwen-plus-2025-07-28');
        return {
          status: 200,
          data: { choices: [{ message: { content: '{"ok":true}' } }], usage: {} },
        };
      },
    };
    const result = await chatCompletionsText({
      prompt: 'return json',
      env: {
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_BASE_URL: 'https://example.com/compatible-mode/v1',
        DASHSCOPE_API_KEY: 'sk-test',
        OLLAMA_MODEL: 'qwen2.5:3b-instruct',
        LLM_CHAT_MODEL: 'qwen-plus-2025-07-28',
      },
      axiosImpl,
    });
    assert.equal(result.ok, true);
    assert.equal(result.model, 'qwen-plus-2025-07-28');
  });

  it('cloud model missing returns LLM_CHAT_MODEL_missing', async () => {
    const result = await chatCompletionsText({
      prompt: 'x',
      model: 'qwen3.8-max',
      env: {
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_BASE_URL: 'https://example.com/v1',
        DASHSCOPE_API_KEY: 'sk-test',
        OLLAMA_MODEL: 'qwen2.5:3b-instruct',
      },
      axiosImpl: { post: async () => ({ status: 200, data: {} }) },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'LLM_CHAT_MODEL_missing');
  });

  it('fails when key missing', async () => {
    const result = await chatCompletionsText({
      prompt: 'x',
      env: { OPENAI_BASE_URL: 'https://example.com/v1' },
      axiosImpl: { post: async () => ({ status: 200, data: {} }) },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'DASHSCOPE_API_KEY_missing');
  });

  it('masks email and phone before remote POST and unmasks response', async () => {
    let sent = '';
    const axiosImpl = {
      async post(_url, body) {
        sent = body.messages[0].content;
        return {
          status: 200,
          data: {
            choices: [{ message: { content: sent + ' done' } }],
            usage: {},
          },
        };
      },
    };
    const result = await chatCompletionsText({
      prompt: 'Mail a@example.com phone 0912345678',
      env: {
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_BASE_URL: 'https://example.com/v1',
        DASHSCOPE_API_KEY: 'sk-test',
        LLM_CHAT_MODEL: 'qwen-plus-2025-07-28',
      },
      axiosImpl,
    });
    assert.equal(sent.includes('a@example.com'), false);
    assert.equal(sent.includes('0912345678'), false);
    assert.match(sent, /__VH_PII_\d+__/);
    assert.equal(result.ok, true);
    assert.equal(result.text, 'Mail a@example.com phone 0912345678 done');
  });

  it('retries on 429 then succeeds', async () => {
    let attempts = 0;
    const sleeps = [];
    const axiosImpl = {
      async post() {
        attempts += 1;
        if (attempts === 1) {
          return { status: 429, data: {} };
        }
        return {
          status: 200,
          data: { choices: [{ message: { content: '{"ok":true}' } }], usage: {} },
        };
      },
    };
    const result = await chatCompletionsText({
      prompt: 'x',
      env: {
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_BASE_URL: 'https://example.com/v1',
        DASHSCOPE_API_KEY: 'sk-test',
        LLM_CHAT_MODEL: 'qwen-plus-2025-07-28',
      },
      axiosImpl,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
    assert.equal(sleeps.length, 1);
  });
});
