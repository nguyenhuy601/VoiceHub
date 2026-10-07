const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertDocumentWriteAllowed,
  clampDocumentListQuery,
  DOCUMENT_RATE_LIMITED,
} = require('../src/utils/documentWriteLimit');

function sliceMethod(src, name) {
  const start = src.indexOf(`async ${name}(`);
  assert.ok(start >= 0, name);
  const next = src.indexOf('\n  async ', start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('assertDocumentWriteAllowed', () => {
  it('write over limit throws DOCUMENT_RATE_LIMITED and does not call the writer', async () => {
    let writes = 0;
    await assert.rejects(
      async () => {
        await assertDocumentWriteAllowed({
          userId: 'u1',
          bucket: 'write',
          checkRateLimit: async () => ({ allowed: false, remaining: 0 }),
        });
        writes += 1;
      },
      (err) => err.errorCode === DOCUMENT_RATE_LIMITED && err.statusCode === 429 && err.bucket === 'write'
    );
    assert.equal(writes, 0);
  });

  it('no redis / limiter allows: does not invent 429 (D4)', async () => {
    await assertDocumentWriteAllowed({
      userId: 'u1',
      bucket: 'write',
      checkRateLimit: async () => ({ allowed: true, remaining: 10 }),
    });
    await assertDocumentWriteAllowed({
      userId: 'u1',
      checkRateLimit: async () => ({ allowed: true }),
    });
  });
});

describe('clampDocumentListQuery', () => {
  it('caps limit at 100 and page at 1', () => {
    assert.deepEqual(clampDocumentListQuery({ page: 0, limit: 9999 }), { page: 1, limit: 100 });
    assert.deepEqual(clampDocumentListQuery({}), { page: 1, limit: 50 });
    assert.deepEqual(clampDocumentListQuery({ page: '2', limit: '20' }), { page: 2, limit: 20 });
  });
});

describe('document controller source contract', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/controllers/document.controller.js'),
    'utf8'
  );

  it('createDocument asserts write before org lookup and the service write', () => {
    const body = sliceMethod(src, 'createDocument');
    const gate = body.indexOf("bucket: 'write'");
    const org = body.indexOf('assertOrganizationMember');
    const write = body.indexOf('documentService.createDocument');
    assert.ok(gate >= 0 && org > gate && write > gate);
  });

  it('update, version upload, and delete assert write before the service', () => {
    for (const [name, call] of [
      ['updateDocument', 'documentService.updateDocument'],
      ['uploadNewVersion', 'documentService.uploadNewVersion'],
      ['deleteDocument', 'documentService.deleteDocument'],
    ]) {
      const body = sliceMethod(src, name);
      const gate = body.indexOf("bucket: 'write'");
      const write = body.indexOf(call);
      assert.ok(gate >= 0 && write > gate, name);
    }
  });

  it('getDocuments clamps the list and does not rate-limit', () => {
    const body = sliceMethod(src, 'getDocuments');
    const clamp = body.indexOf('clampDocumentListQuery');
    const read = body.indexOf('documentService.getDocuments');
    assert.ok(clamp >= 0 && read > clamp);
    assert.equal(body.includes('bucket:'), false);
  });

  it('purgeOrganizationDocuments does not rate-limit', () => {
    const body = sliceMethod(src, 'purgeOrganizationDocuments');
    assert.equal(body.includes('bucket:'), false);
  });
});
