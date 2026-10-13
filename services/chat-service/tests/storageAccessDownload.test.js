const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  STORAGE_READ,
  decideStorageRead,
  buildDownloadHeaders,
  isRiskyInlineMime,
} = require('../src/utils/storageAccess');

describe('storageAccess download ACL', () => {
  it('allows own temp path', () => {
    const d = decideStorageRead({
      storagePath: 'temp/u1/file.png',
      userId: 'u1',
      linkedMessage: null,
      canAccessLinked: false,
      strict: true,
    });
    assert.equal(d, STORAGE_READ.ALLOW);
  });

  it('denies unlinked path when strict', () => {
    const d = decideStorageRead({
      storagePath: 'chat/org/file.png',
      userId: 'u1',
      linkedMessage: null,
      canAccessLinked: false,
      strict: true,
    });
    assert.equal(d, STORAGE_READ.DENY);
  });

  it('denies linked message without access', () => {
    const d = decideStorageRead({
      storagePath: 'chat/x.png',
      userId: 'u1',
      linkedMessage: { _id: 'm1' },
      canAccessLinked: false,
      strict: true,
    });
    assert.equal(d, STORAGE_READ.DENY);
  });

  it('SVG uses attachment disposition', () => {
    assert.equal(isRiskyInlineMime('image/svg+xml'), true);
    const h = buildDownloadHeaders({
      mimeType: 'image/svg+xml',
      fileName: 'x.svg',
      contentType: 'image/svg+xml',
    });
    assert.ok(h['Content-Disposition'].startsWith('attachment'));
    assert.equal(h['Content-Security-Policy'], 'sandbox');
  });
});
