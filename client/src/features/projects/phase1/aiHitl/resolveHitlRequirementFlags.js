/**
 * Gate1/HITL actor flags — mirror project matrix capabilities (Wave 4).
 * Không OR viewerProjectRoleKeys (tránh dual PM Gate1 approve).
 *
 * Gate1: BA author submit → PO analysis:po_review approve.
 * Gate2: planning:pm_review → [planning:tech_review] → planning:po_review.
 * canApproveOrg vẫn nhận vào API (compat) nhưng AI HITL page không truyền.
 */

/**
 * @param {{
 *   canSubmitOrg?: boolean,
 *   canApproveOrg?: boolean,
 *   canRunOrg?: boolean,
 *   canPromoteOrg?: boolean,
 *   canReviewAnalysisPo?: boolean,
 *   canBaAuthorAnalysis?: boolean,
 *   canReviewPlanningPm?: boolean,
 *   canReviewPlanningTech?: boolean,
 *   canReviewPlanningPo?: boolean,
 * }} input
 */
export function resolveHitlRequirementFlags(input = {}) {
  const projectApprove = Boolean(input.canReviewAnalysisPo);
  // Submit = author only — không dùng analysis:ba_review làm proxy
  const projectSubmit = Boolean(input.canBaAuthorAnalysis);
  const canReviewGate2Pm = Boolean(input.canReviewPlanningPm);
  const canReviewGate2Tech = Boolean(input.canReviewPlanningTech);
  const canReviewGate2Po = Boolean(input.canReviewPlanningPo);

  return {
    canSubmit: Boolean(input.canSubmitOrg) || projectSubmit,
    canApprove: Boolean(input.canApproveOrg) || projectApprove,
    canRun: Boolean(input.canRunOrg) || projectApprove || projectSubmit,
    // Gate2 activate: org create-from-pack OR project PO (planning:po_review)
    canPromote: Boolean(input.canPromoteOrg) || canReviewGate2Po,
    canReviewGate2Pm,
    canReviewGate2Tech,
    canReviewGate2Po,
    projectApprove,
    projectSubmit,
  };
}

export default resolveHitlRequirementFlags;
