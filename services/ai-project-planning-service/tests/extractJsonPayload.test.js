const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractJsonPayload } = require('../src/runtime/ollamaGenerate');

describe('extractJsonPayload truncation repair', () => {
  it('parses complete object', () => {
    const data = extractJsonPayload('Here\n{"rules":[{"id":"1","statement":"A"}]}\n');
    assert.equal(data.rules[0].id, '1');
  });

  it('repairs truncated rules array', () => {
    // Intentionally truncated mid-string (simulates num_predict cut).
    const raw =
      '{"rules":[{"id":"BR-1","statement":"Managers approve leave"},{"id":"BR-2","statement":"HR must';
    const data = extractJsonPayload(raw);
    assert.ok(data);
    assert.ok(Array.isArray(data.rules));
    assert.ok(data.rules.length >= 1);
    assert.equal(data.rules[0].id, 'BR-1');
  });
});
