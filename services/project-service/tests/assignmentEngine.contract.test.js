const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { assertCanAssign } = require('../src/services/assignmentEngine.service');
const { DELEGATION_TEMPLATES } = require('../src/config/projectRoleDefaults');

describe('assignmentEngine contract', () => {
  const savedFlag = process.env.ASSIGNMENT_ENGINE_V1;

  beforeEach(() => {
    process.env.ASSIGNMENT_ENGINE_V1 = 'true';
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.ASSIGNMENT_ENGINE_V1;
    else process.env.ASSIGNMENT_ENGINE_V1 = savedFlag;
  });

  it('product template covers mentor / QA / Arch / PM cases', () => {
    const edges = DELEGATION_TEMPLATES.product.edges;
    const has = (from, to, type) =>
      edges.some(([f, t, types]) => {
        if (f !== from || t !== to) return false;
        if (!type) return true;
        return types.includes('*') || types.includes(type);
      });
    assert.equal(has('senior_developer', 'intern'), true);
    assert.equal(has('architect', 'senior_developer'), true);
    assert.equal(has('qa', 'developer', 'bug'), true);
    assert.equal(has('project_manager', 'qa'), true);
    assert.equal(has('developer', 'project_manager'), false);
  });

  it('system admin break-glass without graph lookup', async () => {
    const result = await assertCanAssign({
      actorUserId: 'a',
      targetUserId: 'b',
      boardId: '507f1f77bcf86cd799439011',
      systemMembershipRole: 'admin',
    });
    assert.equal(result.ok, true);
    assert.equal(result.breakGlass, true);
  });

  it('watcher slot skips delegation', async () => {
    const result = await assertCanAssign({
      actorUserId: 'a',
      targetUserId: 'b',
      boardId: '507f1f77bcf86cd799439011',
      slot: 'watcher',
    });
    assert.equal(result.ok, true);
    assert.equal(result.reason, 'watcher_no_delegation');
  });
});
