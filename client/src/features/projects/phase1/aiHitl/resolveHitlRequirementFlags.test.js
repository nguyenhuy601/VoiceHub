/**
 * Wave 4 — HITL flags mirror matrix caps; no dual role-key OR.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveHitlRequirementFlags } from './resolveHitlRequirementFlags.js';

describe('resolveHitlRequirementFlags', () => {
  it('PM role-key alone does not grant Gate1 approve', () => {
    const flags = resolveHitlRequirementFlags({
      viewerProjectRoleKeys: ['project_manager'],
      canReviewAnalysisPo: false,
      canBaAuthorAnalysis: false,
    });
    assert.equal(flags.canApprove, false);
    assert.equal(flags.projectApprove, false);
  });

  it('BA author ≠ Gate1 approve; grants submit', () => {
    const flags = resolveHitlRequirementFlags({
      canBaAuthorAnalysis: true,
      canReviewAnalysisPo: false,
    });
    assert.equal(flags.canSubmit, true);
    assert.equal(flags.canApprove, false);
    assert.equal(flags.projectSubmit, true);
  });

  it('canReviewAnalysisBa alone does not grant submit', () => {
    const flags = resolveHitlRequirementFlags({
      canReviewAnalysisBa: true,
      canBaAuthorAnalysis: false,
      canSubmitOrg: false,
    });
    assert.equal(flags.canSubmit, false);
  });

  it('PO canReviewAnalysisPo grants Gate1 approve', () => {
    const flags = resolveHitlRequirementFlags({
      canReviewAnalysisPo: true,
    });
    assert.equal(flags.canApprove, true);
    assert.equal(flags.projectApprove, true);
  });

  it('canApproveOrg still works if caller passes it (compat); HITL page does not', () => {
    const withOrg = resolveHitlRequirementFlags({ canApproveOrg: true });
    assert.equal(withOrg.canApprove, true);
    const without = resolveHitlRequirementFlags({});
    assert.equal(without.canApprove, false);
  });

  it('PM canReviewPlanningPm = Gate2 PM only', () => {
    const flags = resolveHitlRequirementFlags({
      canReviewPlanningPm: true,
      canReviewPlanningPo: false,
      canReviewAnalysisPo: false,
    });
    assert.equal(flags.canReviewGate2Pm, true);
    assert.equal(flags.canReviewGate2Po, false);
    assert.equal(flags.canApprove, false);
  });

  it('PO canReviewPlanningPo = Gate2 PO + canPromote', () => {
    const flags = resolveHitlRequirementFlags({
      canReviewPlanningPo: true,
    });
    assert.equal(flags.canReviewGate2Po, true);
    assert.equal(flags.canPromote, true);
  });

  it('canSubmitOrg OR canBaAuthorAnalysis for submit', () => {
    assert.equal(resolveHitlRequirementFlags({ canSubmitOrg: true }).canSubmit, true);
    assert.equal(
      resolveHitlRequirementFlags({ canBaAuthorAnalysis: true }).canSubmit,
      true
    );
  });

  it('ignores viewerProjectRoleKeys even if passed', () => {
    const flags = resolveHitlRequirementFlags({
      viewerProjectRoleKeys: ['product_owner', 'project_manager', 'business_analyst'],
    });
    assert.equal(flags.canApprove, false);
    assert.equal(flags.canSubmit, false);
    assert.equal(flags.canReviewGate2Pm, false);
    assert.equal(flags.canReviewGate2Po, false);
  });
});
