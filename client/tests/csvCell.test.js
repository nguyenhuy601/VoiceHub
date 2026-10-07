import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCsv, CSV_BOM, escapeCsvCell } from '../src/features/adminTasks/csvCell.js';

describe('escapeCsvCell', () => {
  it('tiền tố \' cho = + - @ tab CR (formula injection)', () => {
    assert.equal(escapeCsvCell('=1+1'), "'=1+1");
    assert.equal(escapeCsvCell('+cmd'), "'+cmd");
    assert.equal(escapeCsvCell('-1'), "'-1");
    assert.equal(escapeCsvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(escapeCsvCell('\tTAB'), "'\tTAB");
    // CR cũng kích hoạt quote RFC4180
    assert.equal(escapeCsvCell('\rCR'), `"'\\rCR"`.replace('\\r', '\r'));
  });

  it('bọc quote khi có dấu phẩy, ngoặc kép hoặc xuống dòng', () => {
    assert.equal(escapeCsvCell('a,b'), '"a,b"');
    assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
    assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"');
  });

  it('null/undefined → chuỗi rỗng; số giữ nguyên', () => {
    assert.equal(escapeCsvCell(null), '');
    assert.equal(escapeCsvCell(undefined), '');
    assert.equal(escapeCsvCell(42), '42');
    assert.equal(escapeCsvCell(0), '0');
  });

  it('ô thường không đổi', () => {
    assert.equal(escapeCsvCell('hello'), 'hello');
    assert.equal(escapeCsvCell('Board A'), 'Board A');
  });
});

describe('buildCsv', () => {
  it('bắt đầu bằng UTF-8 BOM', () => {
    const csv = buildCsv([
      ['id', 'title'],
      ['1', '=HYPERLINK("x")'],
    ]);
    assert.ok(csv.startsWith(CSV_BOM));
    assert.equal(CSV_BOM, '\uFEFF');
    assert.equal(escapeCsvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  });

  it('ghép hàng bằng newline', () => {
    const csv = buildCsv([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    assert.equal(csv, `${CSV_BOM}a,b\nc,d`);
  });
});
