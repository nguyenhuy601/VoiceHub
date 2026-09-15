const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Source contract: Wave B scope exposes canCreateProject separately from canCreateTask
 * and emits scopeType / scopeIds facts.
 */
describe('taskWorkspaceScope Create Project flags', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/services/taskWorkspaceScope.service.js'),
    'utf8'
  );

  it('returns canCreateProject alongside canCreateTask', () => {
    assert.match(src, /canCreateProject/);
    assert.match(src, /canCreateTask/);
    assert.match(src, /membershipAccountRole/);
  });

  it('exposes scopeType and scopeIds facts', () => {
    assert.match(src, /scopeType/);
    assert.match(src, /scopeIds/);
  });

  it('documents Membership as account role not Org Role catalog', () => {
    assert.match(src, /not Org Role catalog/i);
  });
});
