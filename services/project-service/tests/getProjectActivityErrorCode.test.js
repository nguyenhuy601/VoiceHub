const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { classifyProjectError } = require('../src/utils/projectErrorClassify');

describe('getProjectActivity errorCode (W7-8 Step 3e)', () => {
  const servicePath = path.join(__dirname, '../src/services/project.service.js');
  const src = fs.readFileSync(servicePath, 'utf8');
  const start = src.indexOf('async function getProjectActivity');
  const end = src.indexOf('\nasync function getProjectFiles');
  const endAlt = src.indexOf('\nasync function ', start + 10);
  const bodyEnd = end > start ? end : endAlt > start ? endAlt : start + 800;
  assert.ok(start >= 0, 'getProjectActivity found');
  const body = src.slice(start, bodyEnd);

  it('deny path sets 403 + PROJECT_PERMISSION_DENIED', () => {
    assert.match(body, /PROJECT_PERMISSION_DENIED/);
    assert.match(body, /statusCode\s*=\s*403/);
    assert.equal(body.includes('statusCode = 404'), false);
  });

  it('classify keeps PROJECT_PERMISSION_DENIED at 403', () => {
    const err = new Error('Không có quyền xem activity');
    err.statusCode = 403;
    err.errorCode = 'PROJECT_PERMISSION_DENIED';
    err.messageUser = 'Không có quyền xem activity';
    const classified = classifyProjectError(err, 400);
    assert.equal(classified.status, 403);
    assert.equal(classified.errorCode, 'PROJECT_PERMISSION_DENIED');
    assert.equal(classified.isInternal, false);
  });
});
