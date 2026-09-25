/**
 * extractCustomerDocumentText — buffer extract matrix.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  extractCustomerDocumentText,
  extractPlainText,
  extractWorkbookText,
  extOf,
} = require('../src/utils/aiAnalysis/extractCustomerDocumentText');

describe('extractCustomerDocumentText', () => {
  it('extOf from filename and mime', () => {
    assert.equal(extOf('a.TXT'), '.txt');
    assert.equal(extOf('x', 'text/csv'), '.csv');
    assert.equal(extOf('y', 'application/pdf'), '.pdf');
  });

  it('extracts utf8 text files', async () => {
    const buf = Buffer.from('Hello intake\nline 2', 'utf8');
    const r = await extractCustomerDocumentText(buf, { filename: 'notes.txt' });
    assert.match(r.text, /Hello intake/);
    assert.equal(r.method, 'utf8');
  });

  it('extracts xlsx sheet prose', async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Value'],
      ['Project Objective', 'Grow CRM'],
      ['Business Scope', 'Sales ops'],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, 'Context');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const r = await extractCustomerDocumentText(buf, { filename: 'raw.xlsx' });
    assert.match(r.text, /Grow CRM/);
    assert.equal(r.method, 'xlsx');
  });

  it('skips unsupported extensions', async () => {
    const r = await extractCustomerDocumentText(Buffer.from('x'), {
      filename: 'deck.pptx',
    });
    assert.equal(r.text, '');
    assert.match(String(r.skipped), /unsupported_ext/);
  });

  it('extractPlainText / extractWorkbookText helpers', () => {
    assert.equal(extractPlainText(Buffer.from('abc')), 'abc');
    assert.equal(extractPlainText(Buffer.alloc(0)), '');
    // Invalid binary may still parse as empty-ish workbook; ensure no throw
    assert.doesNotThrow(() => extractWorkbookText(Buffer.from([0x00, 0x01, 0x02])));
  });

  it('uses ocrFn mock for pdf', async () => {
    const r = await extractCustomerDocumentText(Buffer.from('%PDF'), {
      filename: 'a.pdf',
      ocrFn: async () => ({ text: 'OCR TEXT', method: 'ocr' }),
    });
    assert.equal(r.text, 'OCR TEXT');
  });
});
