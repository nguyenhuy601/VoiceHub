/**
 * Chạy: node --test shared/tests/fieldCrypto.test.js
 * (Đặt ENCRYPTION_MASTER_KEY >= 32 ký tự để test round-trip thật.)
 */
const assert = require('assert');
const { randomBytes } = require('crypto');

const prevKey = process.env.ENCRYPTION_MASTER_KEY;

process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString('hex');

const {
  encryptField,
  decryptField,
  isEncrypted,
  decryptFieldSafe,
} = require('../utils/fieldCrypto');

function testRoundTrip() {
  const plain = 'Xin chào, dữ liệu nhạy cảm 你好';
  const enc = encryptField(plain);
  assert.ok(isEncrypted(enc), 'encrypted payload should be detected');
  assert.strictEqual(decryptField(enc), plain);
}

function testPlaintextPassthrough() {
  const plain = 'no encryption envelope';
  assert.strictEqual(decryptFieldSafe(plain), plain);
}

testRoundTrip();
testPlaintextPassthrough();

if (prevKey !== undefined) process.env.ENCRYPTION_MASTER_KEY = prevKey;
else delete process.env.ENCRYPTION_MASTER_KEY;

console.log('fieldCrypto tests: OK');
