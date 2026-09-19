/**
 * T2 — Admin SRS requirements locale: one nested object + accessPolicy (VI/EN).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, 'adminDomains.strings.js'), 'utf8');
const viSlice = SRC.slice(SRC.indexOf('vi:'), SRC.indexOf('\n  en:'));
const enSlice = SRC.slice(SRC.indexOf('\n  en:'));

describe('adminDomains.requirements i18n', () => {
  it('vi has only one nested adminDomains.requirements object', () => {
    const matches = viSlice.match(/^\s{6}requirements:\s*\{/gm) || [];
    assert.equal(
      matches.length,
      1,
      `expected one nested requirements in vi, got ${matches.length}`
    );
  });

  it('vi requirements block includes accessPolicy.save', () => {
    const start = viSlice.indexOf('      requirements: {');
    const end = viSlice.indexOf('\n      files: {', start);
    assert.ok(start >= 0 && end > start, 'vi requirements block bounds');
    const block = viSlice.slice(start, end);
    assert.match(block, /accessPolicy:\s*\{/);
    assert.match(block, /save:\s*'Lưu cấu hình'/);
    assert.match(block, /title:\s*'File SRS'/);
    assert.match(block, /downloadTemplate:\s*'Tải SRS'/);
    assert.match(block, /uploadPreview:\s*'Tải lên & xem trước'/);
  });

  it('en requirements block includes accessPolicy.save', () => {
    const start = enSlice.indexOf('      requirements: {');
    const end = enSlice.indexOf('\n      files: {', start);
    assert.ok(start >= 0 && end > start, 'en requirements block bounds');
    const block = enSlice.slice(start, end);
    assert.match(block, /accessPolicy:\s*\{/);
    assert.match(block, /save:\s*'Save policy'/);
  });
});
