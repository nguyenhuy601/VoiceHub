const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  makeProjectNotFoundError,
  PROJECT_NOT_FOUND_CODE,
} = require('../src/utils/project/projectNotFoundError');
const { classifyProjectError } = require('../src/utils/projectErrorClassify');

describe('makeProjectNotFoundError (W7-8 Step 3d)', () => {
  it('missing-style error is 404 + PROJECT_NOT_FOUND', () => {
    const err = makeProjectNotFoundError();
    assert.equal(err.statusCode, 404);
    assert.equal(err.errorCode, PROJECT_NOT_FOUND_CODE);
    assert.match(String(err.message), /không tồn tại/i);
  });

  it('classifyProjectError keeps PROJECT_NOT_FOUND (not PROJECT_GET_FAILED)', () => {
    const classified = classifyProjectError(makeProjectNotFoundError(), 400);
    assert.equal(classified.status, 404);
    assert.equal(classified.errorCode, 'PROJECT_NOT_FOUND');
    assert.equal(classified.isInternal, false);
  });
});

describe('getProject visibility status source (W7-8 Step 3d)', () => {
  const servicePath = path.join(__dirname, '../src/services/project.service.js');
  const src = fs.readFileSync(servicePath, 'utf8');
  const start = src.indexOf('async function getProject');
  const end = src.indexOf('async function attachProjectCapabilities');
  assert.ok(start >= 0 && end > start, 'getProject function bounds');
  const body = src.slice(start, end);

  it('legacy deny no longer uses statusCode 403', () => {
    assert.equal(
      (body.match(/statusCode\s*=\s*403/g) || []).length,
      0,
      'getProject must not set statusCode 403'
    );
    assert.equal(body.includes('Không có quyền xem dự án'), false);
  });

  it('uses makeProjectNotFoundError for deny/missing paths', () => {
    assert.match(body, /makeProjectNotFoundError/);
    const throws = body.match(/throw makeProjectNotFoundError/g) || [];
    assert.ok(throws.length >= 4, `expected ≥4 throw makeProjectNotFoundError, got ${throws.length}`);
  });

  it('member OK path still returns attachProjectCapabilities', () => {
    assert.match(body, /return attachProjectCapabilities/);
    assert.match(body, /defaultBoardId/);
  });
});
