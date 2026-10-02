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

  it('fails when key missing', async () => {
    const result = await chatCompletionsText({
      prompt: 'x',
      env: { OPENAI_BASE_URL: 'https://example.com/v1' },
      axiosImpl: { post: async () => ({ status: 200, data: {} }) },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'DASHSCOPE_API_KEY_missing');
  });
});
