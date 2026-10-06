import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHitlRequirementFlags } from './resolveHitlRequirementFlags.js';

describe('resolveHitlRequirementFlags', () => {
  it('project PO grants canApprove without org approve', () => {
    const flags = resolveHitlRequirementFlags({
      canSubmitOrg: false,
      canApproveOrg: false,
      viewerProjectRoleKeys: ['product_owner'],
    });
    assert.equal(flags.canApprove, true);
    assert.equal(flags.canSubmit, false);
    assert.equal(flags.projectApprove, true);
  });

  it('project BA grants canSubmit without org submit', () => {
    const flags = resolveHitlRequirementFlags({
      canSubmitOrg: false,
      canApproveOrg: false,
      viewerProjectRoleKeys: ['business_analyst'],
    });
    assert.equal(flags.canSubmit, true);
    assert.equal(flags.canApprove, false);
  });

  it('canReviewAnalysisPo capability grants approve', () => {
    const flags = resolveHitlRequirementFlags({
      canApproveOrg: false,
      canReviewAnalysisPo: true,
      viewerProjectRoleKeys: [],
    });
    assert.equal(flags.canApprove, true);
  });

  it('org flags still apply', () => {
    const flags = resolveHitlRequirementFlags({
      canSubmitOrg: true,
      canApproveOrg: true,
      viewerProjectRoleKeys: [],
    });
    assert.equal(flags.canSubmit, true);
    assert.equal(flags.canApprove, true);
  });

  it('project manager is approver not submitter', () => {
    const flags = resolveHitlRequirementFlags({
      canSubmitOrg: false,
      canApproveOrg: false,
      viewerProjectRoleKeys: ['project_manager'],
    });
    assert.equal(flags.canApprove, true);
    assert.equal(flags.canSubmit, false);
  });

  it('Gate2 PM vs PO from project roles', () => {
    const pm = resolveHitlRequirementFlags({
      viewerProjectRoleKeys: ['project_manager'],
    });
    assert.equal(pm.canReviewGate2Pm, true);
    assert.equal(pm.canReviewGate2Po, false);

    const po = resolveHitlRequirementFlags({
      viewerProjectRoleKeys: ['product_owner'],
    });
    assert.equal(po.canReviewGate2Pm, false);
    assert.equal(po.canReviewGate2Po, true);
  });

  it('canReviewPlanningPm/Po capabilities grant Gate2 flags', () => {
    const flags = resolveHitlRequirementFlags({
      canReviewPlanningPm: true,
      canReviewPlanningPo: true,
      viewerProjectRoleKeys: [],
    });
    assert.equal(flags.canReviewGate2Pm, true);
    assert.equal(flags.canReviewGate2Po, true);
  });

  it('project PO canPromote without org create-from-pack', () => {
    const flags = resolveHitlRequirementFlags({
      canPromoteOrg: false,
      viewerProjectRoleKeys: ['product_owner'],
    });
    assert.equal(flags.canReviewGate2Po, true);
    assert.equal(flags.canPromote, true);
  });
});
