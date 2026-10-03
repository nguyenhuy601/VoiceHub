const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCustomerDocumentStoragePath,
  sanitizeFilename,
  normalizeIntakeDocClass,
  ALLOWED_EXTENSIONS,
  CUSTOMER_DOC_MAX_BYTES,
} = require('../src/utils/analysis/customerDocumentStorage');
const { fileFilter, ALLOWED_MIME } = require('../src/middleware/customerDocumentUpload');
const { CUSTOMER_DOC_CLASSES } = require('../src/constants/analysisArtifact');

function runFilter(file) {
  return new Promise((resolve) => {
    fileFilter({}, file, (err, ok) => {
      resolve({ err, ok });
    });
  });
}

describe('customerDocumentStorage', () => {
  it('builds path without pending/ prefix', () => {
    const key = buildCustomerDocumentStoragePath({
      projectId: 'abc123',
      docClass: 'customer_raw',
      filename: 'req.pdf',
    });
    assert.match(key, /^projects\/abc123\/customer-docs\/customer_raw\/\d+-req\.pdf$/);
    assert.equal(key.includes('pending/'), false);
  });

  it('sanitizes path traversal in filename', () => {
    assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeFilename('a\\b\\c.docx'), 'c.docx');
  });

  it('normalizes intake docClass', () => {
    assert.equal(normalizeIntakeDocClass('customer_raw'), 'customer_raw');
    assert.equal(normalizeIntakeDocClass('customer_file'), 'customer_file');
    assert.equal(normalizeIntakeDocClass('reference_attachment'), 'reference_attachment');
    assert.equal(normalizeIntakeDocClass('other'), null);
  });

  it('exports size and extension limits', () => {
    assert.equal(CUSTOMER_DOC_MAX_BYTES, 20 * 1024 * 1024);
    assert.ok(ALLOWED_EXTENSIONS.includes('.pdf'));
    assert.ok(ALLOWED_EXTENSIONS.includes('.xlsx'));
  });
});

describe('CUSTOMER_DOC_CLASSES intake additions', () => {
  it('includes customer_file and reference_attachment', () => {
    assert.ok(CUSTOMER_DOC_CLASSES.includes('customer_file'));
    assert.ok(CUSTOMER_DOC_CLASSES.includes('reference_attachment'));
    assert.ok(CUSTOMER_DOC_CLASSES.includes('customer_raw'));
  });
});

describe('customerDocumentUpload fileFilter', () => {
  it('accepts pdf', async () => {
    const { err, ok } = await runFilter({
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
    });
    assert.equal(err, null);
    assert.equal(ok, true);
  });

  it('rejects exe', async () => {
    const { err, ok } = await runFilter({
      originalname: 'malware.exe',
      mimetype: 'application/octet-stream',
    });
    assert.ok(err);
    assert.equal(err.errorCode, 'REQ_DOC_INVALID_FILE');
    assert.equal(ok, undefined);
  });

  it('rejects wrong mime even with ok extension', async () => {
    const { err } = await runFilter({
      originalname: 'a.pdf',
      mimetype: 'application/x-msdownload',
    });
    assert.ok(err);
    assert.equal(err.errorCode, 'REQ_DOC_INVALID_FILE');
  });

  it('allows octet-stream for known extensions', async () => {
    const { err, ok } = await runFilter({
      originalname: 'notes.txt',
      mimetype: 'application/octet-stream',
    });
    assert.equal(err, null);
    assert.equal(ok, true);
    assert.ok(ALLOWED_MIME.has('application/octet-stream'));
  });
});
