/**
 * APS generateJson — openai_compatible path (mock axios).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateJson, ollamaModel } = require('../src/runtime/ollamaGenerate');
const { embedModel, embedVersion } = require('../src/runtime/ollamaEmbed');

describe('ollamaGenerate openai_compatible', () => {
  it('T2: generateJson via chat.completions mock', async () => {
    const axiosImpl = {
      async post(url, body) {
        assert.match(String(url), /\/chat\/completions$/);
        assert.equal(body.stream, false);
        return {
          status: 200,
          data: {
            choices: [{ message: { content: '{"fr":[{"id":"FR-1"}]}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          },
        };
      },
    };

    const env = {
      AI_PLANNING_LLM: '1',
      LLM_PROVIDER: 'openai_compatible',
      OPENAI_BASE_URL: 'https://example.com/compatible-mode/v1',
      DASHSCOPE_API_KEY: 'sk-test',
      OLLAMA_MODEL: 'qwen3.8-max',
    };

    assert.equal(ollamaModel(env), 'qwen3.8-max');

    const result = await generateJson({
      prompt: 'return json',
      env,
      axiosImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.fr[0].id, 'FR-1');
    assert.equal(result.model, 'qwen3.8-max');
  });
});

describe('ollamaEmbed defaults', () => {
  it('T3: default embed model is qwen3-embedding:0.6b', () => {
    assert.equal(embedModel({}), 'qwen3-embedding:0.6b');
    assert.equal(embedVersion({}), 'ollama-qwen3-emb-0.6b');
    assert.equal(
      embedModel({ G7_EMBEDDING_MODEL: 'qwen3-embedding:0.6b' }),
      'qwen3-embedding:0.6b'
    );
  });
});
