const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyPermissionRoute } = require('../src/config/permissions');

describe('D1 dual-path cleanup', () => {
  it('canonical chat/task paths stay mapped', () => {
    assert.equal(classifyPermissionRoute('GET', '/api/messages'), 'action');
    assert.equal(classifyPermissionRoute('GET', '/api/tasks'), 'task_bypass');
  });

  it('removed chat/work prefixes are unmapped', () => {
    assert.equal(classifyPermissionRoute('GET', '/api/chat/messages'), 'unmapped');
    assert.equal(classifyPermissionRoute('GET', '/api/work'), 'unmapped');
    assert.equal(classifyPermissionRoute('GET', '/api/work/boards'), 'unmapped');
  });

  it('gateway service map drops dead prefixes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/config/services.js'), 'utf8');
    assert.equal(/['"]\/api\/chat['"]/.test(src), false);
    assert.equal(/['"]\/api\/work['"]/.test(src), false);
    assert.equal(/['"]\/api\/channels['"]/.test(src), false);
    assert.equal(/['"]\/api\/messages['"]/.test(src), true);
    assert.equal(/['"]\/api\/tasks['"]/.test(src), true);
    assert.equal(/['"]\/api\/organizations['"]/.test(src), true);
  });
});
