import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { looksLikeUtf8Mojibake, repairUtf8Mojibake } = require('../utils/utf8Mojibake.js');

test('repairUtf8Mojibake: Đang xử lý / Chờ NCC', () => {
  assert.equal(repairUtf8Mojibake('Äang xá»­ lÃ½'), 'Đang xử lý');
  assert.equal(repairUtf8Mojibake('Chá» NCC'), 'Chờ NCC');
});

test('repairUtf8Mojibake: idempotent với chuỗi đã đúng', () => {
  assert.equal(repairUtf8Mojibake('Đang xử lý'), 'Đang xử lý');
  assert.equal(repairUtf8Mojibake('Chờ NCC'), 'Chờ NCC');
  assert.equal(repairUtf8Mojibake('Todo'), 'Todo');
  assert.equal(repairUtf8Mojibake(''), '');
});

test('looksLikeUtf8Mojibake', () => {
  assert.equal(looksLikeUtf8Mojibake('Äang xá»­ lÃ½'), true);
  assert.equal(looksLikeUtf8Mojibake('Đang xử lý'), false);
});
