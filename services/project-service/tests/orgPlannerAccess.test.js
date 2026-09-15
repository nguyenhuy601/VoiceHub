const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveOrgPlannerAccessDecision,
} = require('../src/utils/staffing/orgPlannerAccess');

const DEPT = '6a55df5f0888221ae1fca4fcf';

describe('resolveOrgPlannerAccessDecision', () => {
  it('allows org admin without departmentId (elevated)', () => {
    assert.deepEqual(
      resolveOrgPlannerAccessDecision({ isOrgAdmin: true }),
      { allowed: true, elevated: true }
    );
  });

  it('allows resource_manager without departmentId (elevated)', () => {
    assert.deepEqual(
      resolveOrgPlannerAccessDecision({ isResourceManager: true }),
      { allowed: true, elevated: true }
    );
  });

  it('allows project creator with explicit departmentId (scoped, not elevated)', () => {
    assert.deepEqual(
      resolveOrgPlannerAccessDecision({
        canCreateProject: true,
        departmentId: DEPT,
      }),
      { allowed: true, elevated: false }
    );
  });

  it('denies project creator without departmentId (no org-wide PII)', () => {
    assert.deepEqual(
      resolveOrgPlannerAccessDecision({ canCreateProject: true }),
      { allowed: false, elevated: false }
    );
  });

  it('denies org member without create and without elevation', () => {
    assert.deepEqual(
      resolveOrgPlannerAccessDecision({
        departmentId: DEPT,
        canCreateProject: false,
      }),
      { allowed: false, elevated: false }
    );
  });
});
