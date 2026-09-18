const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeResourceRoles,
  normalizeResourceStructured,
  normalizeWbsStructured,
  normalizePlanningStructured,
} = require('../src/utils/planning/resourceStructured');
const {
  evaluateMemberAddBeforePlanBaseline,
  isDeliveryRole,
  isCorePlanningRole,
} = require('../src/utils/planning/memberAddBeforePlanBaseline');

describe('resourceStructured RULE-15', () => {
  it('normalizes roles with skillKeys and effort', () => {
    const roles = normalizeResourceRoles([
      { roleKey: 'Backend', title: 'BE Dev', count: 2, skillKeys: ['Node', 'node'], effortHours: 40 },
      { roleKey: 'Backend', title: 'dup' },
      null,
    ]);
    assert.equal(roles.length, 1);
    assert.equal(roles[0].roleKey, 'backend');
    assert.equal(roles[0].count, 2);
    assert.deepEqual(roles[0].skillKeys, ['node']);
    assert.equal(roles[0].effortHours, 40);
  });

  it('rolls totalEffortHours from roles', () => {
    const s = normalizeResourceStructured({
      roles: [{ roleKey: 'qa', count: 2, effortHours: 10 }],
    });
    assert.equal(s.totalEffortHours, 20);
  });

  it('normalizes WBS effort', () => {
    const s = normalizeWbsStructured({ effortHours: 8, storyPoints: 5, skillKeys: ['React'] });
    assert.equal(s.effortHours, 8);
    assert.equal(s.storyPoints, 5);
    assert.deepEqual(s.skillKeys, ['react']);
  });

  it('dispatches by kind', () => {
    const r = normalizePlanningStructured('RESOURCE', { roles: [{ roleKey: 'pm', count: 1 }] });
    assert.equal(r.roles[0].roleKey, 'pm');
    const w = normalizePlanningStructured('WBS', { effortHours: 3 });
    assert.equal(w.effortHours, 3);
  });
});

describe('memberAddBeforePlanBaseline RULE-14', () => {
  it('classifies roles', () => {
    assert.equal(isCorePlanningRole('project_manager'), true);
    assert.equal(isDeliveryRole('backend_developer'), true);
    assert.equal(isDeliveryRole('product_owner'), false);
  });

  it('allows core roles always', () => {
    const r = evaluateMemberAddBeforePlanBaseline({
      mode: 'enforce',
      roleKeys: ['project_manager', 'business_analyst'],
      planningBaselineExists: false,
    });
    assert.equal(r.allowed, true);
    assert.equal(r.warning, null);
  });

  it('warns delivery before baseline', () => {
    const r = evaluateMemberAddBeforePlanBaseline({
      mode: 'warn',
      roleKeys: ['backend_developer'],
      planningBaselineExists: false,
      resourceApproved: false,
    });
    assert.equal(r.allowed, true);
    assert.equal(r.warning.errorCode, 'PLAN_BASELINE_REQUIRED');
  });

  it('enforces delivery before baseline', () => {
    const r = evaluateMemberAddBeforePlanBaseline({
      mode: 'enforce',
      roleKeys: ['qa_engineer'],
      planningBaselineExists: false,
    });
    assert.equal(r.allowed, false);
    assert.equal(r.error.statusCode, 409);
  });

  it('unlocks when baseline or RESOURCE approved', () => {
    const a = evaluateMemberAddBeforePlanBaseline({
      mode: 'enforce',
      roleKeys: ['developer'],
      planningBaselineExists: true,
    });
    assert.equal(a.allowed, true);
    const b = evaluateMemberAddBeforePlanBaseline({
      mode: 'enforce',
      roleKeys: ['developer'],
      resourceApproved: true,
    });
    assert.equal(b.allowed, true);
  });
});
