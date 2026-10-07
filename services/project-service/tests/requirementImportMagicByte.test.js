const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { isXlsxZipMagic, XLSX_ZIP_MAGIC } = require('../src/utils/requirement/xlsxMagicByte');
const { assertXlsxMagicByte } = require('../src/middleware/requirementImportUpload');

describe('xlsxMagicByte (W7-8 Step 3c)', () => {
  it('accepts buffer with PK\\x03\\x04 header', () => {
    const buf = Buffer.concat([XLSX_ZIP_MAGIC, Buffer.from('rest')]);
    assert.equal(isXlsxZipMagic(buf), true);
  });

  it('rejects empty buffer', () => {
    assert.equal(isXlsxZipMagic(Buffer.alloc(0)), false);
    assert.equal(isXlsxZipMagic(null), false);
    assert.equal(isXlsxZipMagic(undefined), false);
  });

  it('rejects random bytes without ZIP magic', () => {
    assert.equal(isXlsxZipMagic(Buffer.from([0x00, 0x01, 0x02, 0x03])), false);
    assert.equal(isXlsxZipMagic(Buffer.from('not-a-zip')), false);
  });
});

describe('assertXlsxMagicByte middleware', () => {
  function mockRes() {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    return res;
  }

  it('passes when file buffer has ZIP magic', () => {
    let nextCalled = false;
    const req = { file: { buffer: Buffer.concat([XLSX_ZIP_MAGIC, Buffer.from('x')]) } };
    const res = mockRes();
    assertXlsxMagicByte(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it('rejects invalid magic with REQ_IMPORT_FILE_INVALID', () => {
    const req = { file: { buffer: Buffer.from('fake-xlsx') } };
    const res = mockRes();
    assertXlsxMagicByte(req, res, () => {
      assert.fail('next should not be called');
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.errorCode, 'REQ_IMPORT_FILE_INVALID');
    assert.equal(res.body?.success, false);
  });
});

describe('upload path wires magic-byte', () => {
  it('middleware and routes mention REQ_IMPORT_FILE_INVALID / assertXlsxMagicByte', () => {
    const mw = fs.readFileSync(
      path.join(__dirname, '../src/middleware/requirementImportUpload.js'),
      'utf8'
    );
    assert.match(mw, /REQ_IMPORT_FILE_INVALID/);
    assert.match(mw, /isXlsxZipMagic/);
    const reqRoutes = fs.readFileSync(
      path.join(__dirname, '../src/routes/requirement.routes.js'),
      'utf8'
    );
    const analysisRoutes = fs.readFileSync(
      path.join(__dirname, '../src/routes/analysis.routes.js'),
      'utf8'
    );
    assert.match(reqRoutes, /assertXlsxMagicByte/);
    assert.match(analysisRoutes, /assertXlsxMagicByte/);
  });

  it('package.json pins xlsx 0.18.5', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
    );
    assert.match(String(pkg.dependencies?.xlsx || ''), /0\.18\.5/);
  });
});
