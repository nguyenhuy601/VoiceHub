const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { embedText } = require('../src/runtime/ollamaEmbed');

describe('ollamaEmbed', () => {
  it('uses /api/embed when /api/embeddings is 404', async () => {
    const calls = [];
    const axiosImpl = {
      async post(url, body) {
        calls.push({ url, body });
        if (String(url).endsWith('/api/embeddings')) {
          return { status: 404, data: { error: 'not found' } };
        }
        return { status: 200, data: { embeddings: [[0.1, 0.2, 0.3]] } };
      },
    };

    const result = await embedText({
      text: 'student profile',
      env: { OLLAMA_BASE_URL: 'http://ollama:11434' },
      axiosImpl,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.embedding, [0.1, 0.2, 0.3]);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/api\/embeddings$/);
    assert.equal(calls[0].body.prompt, 'student profile');
    assert.match(calls[1].url, /\/api\/embed$/);
    assert.equal(calls[1].body.input, 'student profile');
  });
});