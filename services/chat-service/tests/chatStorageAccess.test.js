process.env.FILE_ALLOWED_MIME = 'text/,image/,application/';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  STORAGE_READ,
  isStorageReadStrict,
  decideStorageRead,
  buildDownloadHeaders,
  hashUserIdForLog,
  storagePathPrefixForLog,
} = require('../src/utils/storageAccess');
const { isMimeAllowed, isMimeDenied } = require('../src/config/fileRetention');
const { filterVerifiedMentionIds } = require('../src/utils/projectMentionNotify');

const originalStrict = process.env.CHAT_STORAGE_READ_STRICT;

afterEach(() => {
  if (originalStrict === undefined) delete process.env.CHAT_STORAGE_READ_STRICT;
  else process.env.CHAT_STORAGE_READ_STRICT = originalStrict;
});

describe('decideStorageRead', () => {
  it('temp của chính mình → allow', () => {
    assert.equal(
      decideStorageRead({ storagePath: 'temp/u1/a.png', userId: 'u1', strict: true }),
      STORAGE_READ.ALLOW
    );
  });

  it('temp người khác, không gắn tin → observe allow_unlinked / strict deny', () => {
    const input = { storagePath: 'temp/u2/a.png', userId: 'u1' };
    assert.equal(decideStorageRead({ ...input, strict: false }), STORAGE_READ.ALLOW_UNLINKED);
    assert.equal(decideStorageRead({ ...input, strict: true }), STORAGE_READ.DENY);
  });

  it('gắn tin: đọc được → allow; không → deny (kể cả observe)', () => {
    const input = { storagePath: 'chat/o1/a.pdf', userId: 'u1', linkedMessage: { _id: 'm1' } };
    assert.equal(decideStorageRead({ ...input, canAccessLinked: true, strict: false }), STORAGE_READ.ALLOW);
    assert.equal(decideStorageRead({ ...input, canAccessLinked: false, strict: false }), STORAGE_READ.DENY);
  });

  it('prefix temp/u1 không khớp temp/u10', () => {
    assert.equal(
      decideStorageRead({ storagePath: 'temp/u10/a.png', userId: 'u1', strict: true }),
      STORAGE_READ.DENY
    );
  });
});

describe('isStorageReadStrict', () => {
  it('mặc định bật khi unset', () => {
    delete process.env.CHAT_STORAGE_READ_STRICT;
    assert.equal(isStorageReadStrict(), true);
  });

  it('tắt với 0/false/off; bật với 1/true/on', () => {
    for (const value of ['0', 'false', 'off', 'no']) {
      process.env.CHAT_STORAGE_READ_STRICT = value;
      assert.equal(isStorageReadStrict(), false, value);
    }
    for (const value of ['1', 'true', 'ON']) {
      process.env.CHAT_STORAGE_READ_STRICT = value;
      assert.equal(isStorageReadStrict(), true, value);
    }
  });
});

describe('MIME denylist', () => {
  it('chặn html/svg/js kể cả khi FILE_ALLOWED_MIME cho text/ image/ application/', () => {
    for (const mime of ['text/html', 'text/html; charset=utf-8', 'image/svg+xml', 'application/javascript']) {
      assert.equal(isMimeDenied(mime), true, mime);
      assert.equal(isMimeAllowed(mime), false, mime);
    }
  });

  it('vẫn cho MIME thường', () => {
    assert.equal(isMimeAllowed('image/png'), true);
    assert.equal(isMimeAllowed('application/pdf'), true);
  });
});

describe('buildDownloadHeaders', () => {
  it('MIME rủi ro → attachment + nosniff + CSP sandbox', () => {
    const headers = buildDownloadHeaders({ mimeType: 'text/html', fileName: 'x.html' });
    assert.match(headers['Content-Disposition'], /^attachment;/);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Content-Security-Policy'], 'sandbox');
    assert.equal(headers['Cache-Control'], 'private, max-age=60');
  });

  it('ảnh thường → inline', () => {
    const headers = buildDownloadHeaders({ mimeType: 'image/png', fileName: 'a.png' });
    assert.match(headers['Content-Disposition'], /^inline;/);
    assert.equal(headers['Content-Type'], 'image/png');
  });

  it('tên file không chèn được header', () => {
    const headers = buildDownloadHeaders({ mimeType: 'image/png', fileName: 'a"\r\nSet-Cookie: x.png' });
    assert.ok(!/[\r\n]/.test(headers['Content-Disposition']));
    assert.equal((headers['Content-Disposition'].match(/"/g) || []).length, 2);
  });
});

describe('log helpers', () => {
  it('hash userId không lộ id gốc', () => {
    const hashed = hashUserIdForLog('507f1f77bcf86cd799439011');
    assert.equal(hashed.length, 12);
    assert.ok(!hashed.includes('507f1f77'));
  });

  it('chỉ log prefix path', () => {
    assert.equal(storagePathPrefixForLog('temp/u1/secret.pdf'), 'temp');
  });
});

describe('filterVerifiedMentionIds', () => {
  it('chỉ giữ id org xác nhận, bỏ sender, loại trùng', () => {
    const rows = [{ userId: 'u2' }, { userId: 'u3' }, { userId: 'u2' }, { userId: 'u1' }];
    assert.deepEqual(filterVerifiedMentionIds(rows, 'u1'), ['u2', 'u3']);
  });

  it('không có row hợp lệ → []', () => {
    assert.deepEqual(filterVerifiedMentionIds(null, 'u1'), []);
    assert.deepEqual(filterVerifiedMentionIds([{}, { userId: '' }], 'u1'), []);
  });

  it('cắt tối đa 50 id', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ userId: `u${i + 2}` }));
    assert.equal(filterVerifiedMentionIds(rows, 'u1').length, 50);
  });
});
