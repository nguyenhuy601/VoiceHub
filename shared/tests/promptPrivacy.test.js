/**
 * Unit — prompt PII mask / unmask.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { maskPromptPrivacy, unmaskPromptPrivacy } = require('../llm/promptPrivacy');

describe('promptPrivacy', () => {
  it('masks email and phone, restores after unmask', () => {
    const src =
      'Liên hệ a@example.com hoặc 0912345678. JSON {"title":"ok"} giữ nguyên khóa.';
    const { text, tokens } = maskPromptPrivacy(src);
    assert.equal(text.includes('a@example.com'), false);
    assert.equal(text.includes('0912345678'), false);
    assert.match(text, /__VH_PII_\d+__/);
    assert.equal(text.includes('"title"'), true);
    const back = unmaskPromptPrivacy(text, tokens);
    assert.equal(back, src);
  });

  it('leaves plain text without PII unchanged', () => {
    const src = 'Tóm tắt cuộc họp về kế hoạch sprint.';
    const { text, tokens } = maskPromptPrivacy(src);
    assert.equal(text, src);
    assert.equal(tokens.size, 0);
  });
});
