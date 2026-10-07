const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { attachmentHeader } = require('../src/utils/common/contentDisposition');

describe('attachmentHeader', () => {
  it('includes UTF-8 filename* and ASCII fallback for Vietnamese names', () => {
    const h = attachmentHeader('Báo cáo SRS.xlsx', 'srs.xlsx');
    assert.match(h, /^attachment; filename="/);
    assert.match(h, /filename\*=UTF-8''/);
    assert.ok(!h.includes('\r'));
    assert.ok(!h.includes('\n'));
  });

  it('strips quotes, path traversal, and CR/LF', () => {
    const h = attachmentHeader('../evil"\r\nname.xlsx', 'safe.xlsx');
    assert.ok(!h.includes('\r'));
    assert.ok(!h.includes('\n'));
    assert.ok(!h.includes('../'));
    assert.ok(!h.includes('"\r'));
    assert.match(h, /filename="/);
  });

  it('uses fallback when empty', () => {
    const h = attachmentHeader('', 'download.bin');
    assert.match(h, /filename="download\.bin"/);
  });
});
