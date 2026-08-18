const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  applyDecisionToChain,
  actorCanDecideStep,
  isChainComplete,
  normalizePolicySteps,
  validatePolicySteps,
  BUILTIN_POLICIES,
  TASK_DONE_STEPS_BY_SIZE,
  suggestedTaskDonePolicyKey,
} = require('../src/utils/approvalChain');

const TASK_DONE_STEPS = normalizePolicySteps(TASK_DONE_STEPS_BY_SIZE.sme);

describe('approvalChain (Phase 5)', () => {
  it('T1: chưa đủ bước → transition không complete', () => {
    const r1 = applyDecisionToChain({
      steps: TASK_DONE_STEPS,
      currentStep: 0,
      decisions: [],
      actor: { userId: 'u1', projectRoleKeys: ['technical_lead'] },
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
      actor: { userId: 'u2', projectRoleKeys: ['backend_developer'] },
      decision: 'approve',
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 403);
  });

  it('T2b: legacy tech_lead alias vẫn approve technical_lead step', () => {
    const r = applyDecisionToChain({
      steps: TASK_DONE_STEPS,
      currentStep: 0,
      decisions: [],
      actor: { userId: 'u1', projectRoleKeys: ['tech_lead'] },
      decision: 'approve',
    });
    assert.equal(r.ok, true);
  });

  it('T3: Policy step roleKey custom_* → validation fail', () => {
    const r = validatePolicySteps([
      { order: 1, approverType: 'project_role', roleKey: 'custom_approver', quorum: 1 },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 400);
    assert.ok(r.invalidKeys.includes('custom_approver'));
  });

  it('T3b: master keys pass validation', () => {
    const r = validatePolicySteps(TASK_DONE_STEPS_BY_SIZE.sme);
    assert.equal(r.ok, true);
  });

  it('T4: full chain → approved (Done)', () => {
    let state = { currentStep: 0, decisions: [], status: 'pending' };
    const actors = [
      { userId: 'tl', projectRoleKeys: ['technical_lead'] },
      { userId: 'qa', projectRoleKeys: ['qa_engineer'] },
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

  it('T5: reject → rejected (service restores fromStatus)', () => {
    const r = applyDecisionToChain({
      steps: TASK_DONE_STEPS,
      currentStep: 0,
      decisions: [],
      actor: { userId: 'tl', projectRoleKeys: ['technical_lead'] },
      decision: 'reject',
      comment: 'needs work',
    });
    assert.equal(r.ok, true);
    assert.equal(r.nextStatus, 'rejected');
    const svc = fs.readFileSync(
      path.join(__dirname, '../src/services/approval.service.js'),
      'utf8'
    );
    assert.match(svc, /async function restoreTaskAfterReject/);
    assert.match(svc, /request\.fromStatus/);
  });

  it('T6: cancel when card archive/delete', () => {
    const boardSrc = fs.readFileSync(
      path.join(__dirname, '../src/services/taskBoard.service.js'),
      'utf8'
    );
    const svc = fs.readFileSync(
      path.join(__dirname, '../src/services/approval.service.js'),
      'utf8'
    );
    assert.match(svc, /async function cancelPendingForEntity/);
    assert.match(boardSrc, /cancelPendingForEntity/);
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

  it('builtin policies: master keys + stubs + company size variants', () => {
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'mr_merge'));
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'release_deploy'));
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'task_done_startup'));
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'task_done_enterprise'));
    assert.ok(BUILTIN_POLICIES.some((p) => p.key === 'change_request_default'));
    const crPolicy = BUILTIN_POLICIES.find((p) => p.key === 'change_request_default');
    assert.ok(crPolicy.entityTypes.includes('change_request'));
    assert.deepEqual(
      crPolicy.steps.map((s) => s.roleKey),
      ['business_analyst', 'product_owner', 'project_manager']
    );
    assert.equal(suggestedTaskDonePolicyKey('startup'), 'task_done_startup');
    assert.equal(suggestedTaskDonePolicyKey('enterprise'), 'task_done_enterprise');
    for (const p of BUILTIN_POLICIES) {
      const v = validatePolicySteps(p.steps);
      assert.equal(v.ok, true, `${p.key}: ${v.message}`);
    }
  });

  it('normalize aliases legacy → master', () => {
    const steps = normalizePolicySteps([
      { order: 1, approverType: 'project_role', roleKey: 'tech_lead', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'qa', quorum: 1 },
    ]);
    assert.equal(steps[0].roleKey, 'technical_lead');
    assert.equal(steps[1].roleKey, 'qa_engineer');
  });
});
