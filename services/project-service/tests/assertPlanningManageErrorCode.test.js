const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { classifyProjectError } = require('../src/utils/projectErrorClassify');

describe('assertPlanningManage errorCode (W7-8 Step 3f)', () => {
  const servicePath = path.join(__dirname, '../src/services/planning.service.js');
  const src = fs.readFileSync(servicePath, 'utf8');
  const start = src.indexOf('async function assertPlanningManage');
  const end = src.indexOf('\nasync function assertPlanningPrioritizeOrWrite');
  assert.ok(start >= 0, 'assertPlanningManage found');
  const body = src.slice(start, end > start ? end : start + 600);

  it('legacy deny path sets 403 + PROJECT_PERMISSION_DENIED', () => {
    assert.match(body, /!isProjectRbacV2Enabled\(\)/);
    assert.match(body, /PROJECT_PERMISSION_DENIED/);
    assert.match(body, /statusCode\s*=\s*403/);
    assert.equal(body.includes('statusCode = 404'), false);
  });

  it('classify keeps PROJECT_PERMISSION_DENIED at 403', () => {
    const err = new Error('Không có quyền quản lý planning');
    err.statusCode = 403;
    err.errorCode = 'PROJECT_PERMISSION_DENIED';
    err.messageUser = 'Không có quyền quản lý planning';
    const classified = classifyProjectError(err, 400);
    assert.equal(classified.status, 403);
    assert.equal(classified.errorCode, 'PROJECT_PERMISSION_DENIED');
    assert.equal(classified.isInternal, false);
  });
});
