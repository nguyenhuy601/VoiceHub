const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyDecisionToChain,
  actorCanDecideStep,
  isChainComplete,
  normalizePolicySteps,
  BUILTIN_POLICIES,
} = require('../src/utils/approvalChain');

const TASK_DONE_STEPS = normalizePolicySteps(BUILTIN_POLICIES[0].steps);

describe('approvalChain (Phase 5)', () => {
  it('T1: chưa đủ bước → không complete', () => {
    const r1 = applyDecisionToChain({
      steps: TASK_DONE_STEPS,
      currentStep: 0,
      decisions: [],
      actor: { userId: 'u1', projectRoleKeys: ['tech_lead'] },
      decision: 'approve',
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.nextStatus, 'pending');
    assert.equal(r1.currentStep, 1);
    assert.equal(isChainComplete(r1.nextStatus), false);
  });

  it('T2: sai role approve → 403', () => {
    const r = applyDecisionToChain({
      steps: TASK_DONE_STEPS,
      currentStep: 0,
      decisions: [],
      actor: { userId: 'u2', projectRoleKeys: ['developer'] },
      decision: 'approve',
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 403);
  });

  it('T3: full chain → approved', () => {
    let state = { currentStep: 0, decisions: [], status: 'pending' };
    const actors = [
      { userId: 'tl', projectRoleKeys: ['tech_lead'] },
      { userId: 'qa', projectRoleKeys: ['qa'] },
      { userId: 'pm', projectRoleKeys: ['project_manager'] },
    ];
    for (const actor of actors) {
      const r = applyDecisionToChain({
        steps: TASK_DONE_STEPS,
        currentStep: state.currentStep,
        decisions: state.decisions,
        actor,
        decision: 'approve',
      });
      assert.equal(r.ok, true);
      state = {
        currentStep: r.currentStep,
        decisions: r.decisions,
        status: r.nextStatus,
      };
    }
    assert.equal(state.status, 'approved');
    assert.equal(isChainComplete(state.status), true);
  });

  it('T4: reject → rejected (restore previous ở service)', () => {
    const r = applyDecisionToChain({
      steps: TASK_DONE_STEPS,
      currentStep: 0,
      decisions: [],
      actor: { userId: 'tl', projectRoleKeys: ['tech_lead'] },
      decision: 'reject',
      comment: 'needs work',
    });
    assert.equal(r.ok, true);
    assert.equal(r.nextStatus, 'rejected');
  });

  it('org admin can decide any step', () => {
    assert.equal(
      actorCanDecideStep(TASK_DONE_STEPS[1], {
        userId: 'admin',
        isOrgAdmin: true,
        projectRoleKeys: [],
      }),
      true
    );
  });

  it('builtin policies include stubs', () => {
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'mr_merge'));
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'release_deploy'));
  });
});
